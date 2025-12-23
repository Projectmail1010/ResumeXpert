# skill_matcher.py
"""
Robust SkillMatcher.
- Loads skills_config.json
- Canonicalizes tokens using aliases + family expansion
- Matches by: exact canonical, family match, fuzzy (SequenceMatcher), semantic (optional)
- Returns: dict jd_skill -> (matched_bool, method, resume_token, score)
"""

import json
import os
import re
from difflib import SequenceMatcher
from typing import List, Dict, Tuple, Optional
import threading

# semantic imports (optional)
try:
    from sentence_transformers import SentenceTransformer, util
    _HAS_ST = True
except Exception:
    _HAS_ST = False

def norm_text(s: str) -> str:
    if s is None:
        return ""
    s = s.strip().lower()
    s = re.sub(r'[\r\n\t]+', ' ', s)
    s = re.sub(r'^[^\w\+#\.]+|[^\w\+#\.]+$', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s

class SkillMatcher:
    def __init__(self, config_path: str = "skills_config.json", use_semantic: Optional[bool] = None):
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"skills config not found: {config_path}")
        with open(config_path, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)

        # alias: alias -> canonical (lowercased)
        self.aliases: Dict[str, str] = {k.lower(): v.lower() for k, v in cfg.get("aliases", {}).items()}

        # families: family -> list of canonical engine names (lowercased)
        self.families: Dict[str, List[str]] = {k.lower(): [x.lower() for x in v] for k, v in cfg.get("families", {}).items()}

        # engine -> families (reverse mapping)
        self.engine_to_families: Dict[str, List[str]] = {}
        for fam, engines in self.families.items():
            for e in engines:
                self.engine_to_families.setdefault(e, []).append(fam)

        # thresholds 
        th = cfg.get("thresholds", {})
        self.fuzzy_ratio = float(th.get("fuzzy_ratio", 0.85))
        self.semantic_cosine = float(th.get("semantic_cosine", 0.75))

        # semantic config
        sem_cfg = cfg.get("semantic", {})
        self.semantic_enabled = bool(sem_cfg.get("enabled", False))
        self.semantic_model_name = sem_cfg.get("model_name", "sentence-transformers/all-MiniLM-L6-v2")

        # allow override param
        if use_semantic is not None:
            self.semantic_enabled = bool(use_semantic)

        # lazy model loader
        self._st_model = None
        self._model_lock = threading.Lock()
        if self.semantic_enabled and not _HAS_ST:
            # disable semantic fallback if package missing
            print("Warning: sentence-transformers not installed. Semantic fallback disabled.")
            self.semantic_enabled = False

    def _ensure_model(self):
        """Lazy-load the sentence transformer model if needed."""
        if not self.semantic_enabled:
            return
        if self._st_model is None:
            with self._model_lock:
                if self._st_model is None:
                    self._st_model = SentenceTransformer(self.semantic_model_name)

    def _canonicalize_token(self, tok: str) -> List[str]:
        """Return list of canonical tokens for a given token."""
        if not tok:
            return []
        t = norm_text(tok)
        # remove common version markers 
        t = re.sub(r'\bv?\d+(\.\d+)*\b', '', t).strip()
        t = re.sub(r'[\-_]+', ' ', t).strip()
        # alias mapping
        if t in self.aliases:
            t = self.aliases[t]
        # if token is a family name -> expand
        if t in self.families:
            # return unique list preserving order
            seen = set()
            out = []
            for e in self.families[t]:
                if e not in seen:
                    seen.add(e)
                    out.append(e)
            return out
        # otherwise return single canonical token
        return [t]

    def canonicalize_list(self, toks: List[str]) -> List[str]:
        """Flatten canonicalization for a list of tokens (unique, preserving order)."""
        out = []
        seen = set()
        for t in toks:
            for c in self._canonicalize_token(t):
                if c and c not in seen:
                    seen.add(c)
                    out.append(c)
        return out

    def _safe_fuzzy(self, a: str, b: str) -> float:
        """Return SequenceMatcher ratio in 0..1"""
        if not a or not b:
            return 0.0
        ra = norm_text(a)
        rb = norm_text(b)
        return SequenceMatcher(None, ra, rb).ratio()

    def _semantic_score(self, a: str, b: str) -> float:
        """Compute semantic cosine similarity using sentence-transformers (0..1)."""
        if not self.semantic_enabled:
            return 0.0
        self._ensure_model()
        if not self._st_model:
            return 0.0
        emb = self._st_model.encode([a, b], convert_to_tensor=True)
        sim = float(util.cos_sim(emb[0], emb[1]).item())
        return sim

    def match_resume_to_jd(self, resume_tokens: List[str], jd_tokens: List[str]) -> Dict[str, Tuple[bool, str, Optional[str], float]]:
        """
        For each jd token (original string) return tuple:
            (matched_bool, method, matched_resume_token_or_None, score)
        method is one of: 'exact_canonical', 'family_match', 'fuzzy', 'semantic', or None
        score in 0..1 (1.0 exact)

        Debugging: set `matcher.debug = True` to print per-JD matching details.
        """
        results: Dict[str, Tuple[bool, str, Optional[str], float]] = {}

        # prepare resume canonical map: list of tuples (raw_resume_token, [canonical_forms...])
        resume_map: List[Tuple[str, List[str]]] = []
        for rt in resume_tokens:
            if not rt or not rt.strip():
                continue
            rc_list = self._canonicalize_token(rt)
            resume_map.append((rt, rc_list))

        # print resume_map once if debugging
        if getattr(self, "debug", False):
            print("\nDEBUG: resume_map (raw -> canonical list):")
            for raw, rc_list in resume_map:
                print(f"  - {raw!r} -> {rc_list}")
            print("END resume_map\n")

        # For each JD skill, attempt match
        for jd in jd_tokens:
            jd_orig = jd
            jd_cands = self._canonicalize_token(jd)
            matched = False
            match_info: Tuple[bool, str, Optional[str], float] = (False, None, None, 0.0)

            if getattr(self, "debug", False):
                print("="*60)
                print("DEBUG: Evaluating JD token:", repr(jd_orig))
                print("  Canonical JD candidates:", jd_cands)

            # 1) exact canonical match or resume canonical in JD canonical
            if getattr(self, "debug", False):
                print("  Step 1: exact canonical checks...")
            for raw_res, rc_list in resume_map:
                for rc in rc_list:
                    if rc in jd_cands:
                        matched = True
                        match_info = (True, "exact_canonical", raw_res, 1.0)
                        if getattr(self, "debug", False):
                            print(f"    -> exact_canonical: resume token {raw_res!r} (canonical {rc!r})")
                        break
                if matched:
                    break
            if matched:
                results[jd_orig] = match_info
                if getattr(self, "debug", False):
                    print(f"  Result for JD token {jd_orig!r}: {match_info}")
                continue

            # 2) family match (JD is a family) OR resume token is family that includes JD engine
            if getattr(self, "debug", False):
                print("  Step 2: family checks (both directions)...")
            for raw_res, rc_list in resume_map:
                family_matched = False
                for jd_c in jd_cands:
                    if jd_c in self.families:
                        fam_engines = self.families.get(jd_c, [])
                        for rc in rc_list:
                            if rc in fam_engines:
                                matched = True
                                match_info = (True, "family_match", raw_res, 0.98)
                                family_matched = True
                                if getattr(self, "debug", False):
                                    print(f"    -> family_match: JD family {jd_c!r} matched resume canonical {rc!r} via raw {raw_res!r}")
                                break
                    if family_matched:
                        break
                    # reverse: resume canonical is a family and JD canonical is inside it
                    for rc in rc_list:
                        if rc in self.families:
                            if jd_c in self.families.get(rc, []):
                                matched = True
                                match_info = (True, "family_match", raw_res, 0.98)
                                family_matched = True
                                if getattr(self, "debug", False):
                                    print(f"    -> family_match (reverse): resume family {rc!r} contains JD canonical {jd_c!r} via raw {raw_res!r}")
                                break
                    if family_matched:
                        break
                if matched:
                    break
            if matched:
                results[jd_orig] = match_info
                if getattr(self, "debug", False):
                    print(f"  Result for JD token {jd_orig!r}: {match_info}")
                continue

            # 3) fuzzy match between jd canonical names and resume canonical names
            if getattr(self, "debug", False):
                print("  Step 3: fuzzy matching between canonicals...")
            best_score = 0.0
            best_raw = None
            best_pair = (None, None)  # (jd_c, rc) best canonical pair
            for raw_res, rc_list in resume_map:
                for rc in rc_list:
                    for jd_c in jd_cands:
                        try:
                            score = self._safe_fuzzy(jd_c, rc)
                        except Exception:
                            score = 0.0
                        if score > best_score:
                            best_score = score
                            best_raw = raw_res
                            best_pair = (jd_c, rc)
            if getattr(self, "debug", False):
                print(f"    best fuzzy candidate pair: jd_c={best_pair[0]!r}, resume_canonical={best_pair[1]!r}, score={best_score:.4f}")
            if best_score >= self.fuzzy_ratio:
                results[jd_orig] = (True, "fuzzy", best_raw, float(best_score))
                if getattr(self, "debug", False):
                    print(f"  -> fuzzy MATCH chosen for JD {jd_orig!r}: raw={best_raw!r}, score={best_score:.4f}")
                continue

            # 4) semantic fallback (compare jd original & resume raw token and canonical forms)
            if self.semantic_enabled:
                if getattr(self, "debug", False):
                    print("  Step 4: semantic fallback (if enabled) ...")
                best_sem = 0.0
                best_raw_sem = None
                best_sem_pair = (None, None)
                compare_jds = [jd_orig] + jd_cands
                for raw_res, rc_list in resume_map:
                    for jtxt in compare_jds:
                        try:
                            sem = self._semantic_score(jtxt, raw_res)
                        except Exception:
                            sem = 0.0
                        if sem > best_sem:
                            best_sem = sem
                            best_raw_sem = raw_res
                            best_sem_pair = (jtxt, raw_res)
                    for rc in rc_list:
                        for jtxt in compare_jds:
                            try:
                                sem2 = self._semantic_score(jtxt, rc)
                            except Exception:
                                sem2 = 0.0
                            if sem2 > best_sem:
                                best_sem = sem2
                                best_raw_sem = raw_res
                                best_sem_pair = (jtxt, rc)
                if getattr(self, "debug", False):
                    print(f"    best semantic candidate: pair={best_sem_pair}, score={best_sem:.4f}")
                if best_sem >= self.semantic_cosine:
                    results[jd_orig] = (True, "semantic", best_raw_sem, float(best_sem))
                    if getattr(self, "debug", False):
                        print(f"  -> semantic MATCH chosen for JD {jd_orig!r}: raw={best_raw_sem!r}, score={best_sem:.4f}")
                    continue

            # 5) no match
            results[jd_orig] = (False, None, None, 0.0)
            if getattr(self, "debug", False):
                print(f"  -> no match for JD token {jd_orig!r}.\n")

        # optionally print a compact summary of results
        if getattr(self, "debug", False):
            print("\nDEBUG: match_resume_to_jd results summary:")
            matched_list = []
            for jd, info in results.items():
                matched, method, raw, score = info
                print(f"  JD token: {jd!r}  -> matched={matched}, method={method}, raw={raw!r}, score={score}")
                if matched:
                    matched_list.append((jd, method, raw, score))
            print(f"\nTotal matched JD tokens: {len(matched_list)}")
            if matched_list:
                print("Matched tokens (jd_token, method, resume_token, score):")
                for x in matched_list:
                    print(" ", x)
            print("="*60 + "\n")

        return results

