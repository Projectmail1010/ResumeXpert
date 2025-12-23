from saving import store_files_in_db
import spacy
import spacy.matcher
from spacy.matcher import PhraseMatcher
import re
import pdfplumber
from pdfminer.high_level import extract_text
from docx import Document
import psycopg2
from psycopg2 import sql
import difflib
import re

# Initialize Flask app and spaCy model
# app = Flask(__name__)
# nlp = spacy.load("en_core_web_trf")

nlp = spacy.load("en_core_web_trf")
# Extract text from PDF using pdfminer
def extract_text_from_pdf(file_path):
    """Extracts text from a PDF using pdfminer."""
    try:
        # Open the PDF file
        with pdfplumber.open(file_path) as pdf:
            text = ""
    
            # Loop through all pages
            for page in pdf.pages:
                text += page.extract_text() + "\n"
    
            return text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return ""

def extract_text_from_docx(file_path):
    """Extracts text from a DOCX file using python-docx."""
    try:
        doc = Document(file_path)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text
    except Exception as e:
        print(f"Error extracting text from DOCX: {e}")
        return ""

def extract_text_from_file(file_path):
    """Extracts text from a file, either PDF or DOCX."""
    if file_path.lower().endswith('.pdf'):
        return extract_text_from_pdf(file_path)
    elif file_path.lower().endswith('.docx') or file_path.lower().endswith('.doc'):
        return extract_text_from_docx(file_path)
    else:
        print("Unsupported file format.")
        return ""

# Extract name, phone, and email
def extract_details(text):
    
    # Process text with spaCy
    doc = nlp(text)
    print(doc)
    # Extract potential name (first and last name, proper nouns)
    name_candidates = [ent.text for ent in doc.ents if ent.label_ == "PERSON"]

    # Use regex to find email addresses
    email_matches = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)

    # Use regex to find phone numbers (Indian format)
    phone_matches = re.findall(r"\+91[-\s]?[789]\d{2}[-\s]?\d{3}[-\s]?\d{4}|\(?\d{2,4}\)?[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{2,4}", text)
    phone_matches = [re.sub(r"[-\s()]", "", phone) for phone in phone_matches]  # Remove separators
    phone_matches = [phone if phone.startswith("+91 ") else "+91 " + phone[-10:] for phone in phone_matches]  # Ensure format

    # Extract the closest name to email and phone
    best_name = name_candidates[0] if name_candidates else None
    best_email = email_matches[0] if email_matches else None
    best_phone = phone_matches[0] if phone_matches else None

    return best_name, best_email, best_phone

def similar(a, b, threshold=0.8):
    """
    Returns True if strings a and b are similar above the given threshold.
    """
    return difflib.SequenceMatcher(None, a, b).ratio() >= threshold

def extract_section(text, section_keywords, stop_keywords):
    """
    Extract a section from resume text based on header keywords.
    
    Args:
        text: The full resume text.
        section_keywords: List of keywords that indicate the start of the section.
        stop_keywords: List of keywords that indicate the start of a new section.
    
    Returns:
        The text block corresponding to the section (if found), or an empty string.
    """
    lines = text.split("\n")
    capture = False
    section_lines = []
    
    for line in lines:
        stripped_line = line.strip()
        # Check for a header indicating the start of the desired section.
        if any(re.search(rf"\b{kw}\b", stripped_line, re.IGNORECASE) for kw in section_keywords):
            capture = True
            # If the header contains a colon with content, capture the content after the colon.
            if ':' in stripped_line:
                parts = stripped_line.split(":", 1)
                if parts[1].strip():
                    section_lines.append(parts[1].strip())
            continue
        
        # If we are capturing and hit a stop header, stop capturing.
        if capture and any(re.search(rf"\b{kw}\b", stripped_line, re.IGNORECASE) for kw in stop_keywords):
            break
        
        if capture:
            section_lines.append(stripped_line)
    
    return "\n".join(section_lines).strip()

def extract_skills(text, job_description=None):
    # Define possible headers for the skills section and stop headers for other sections.
    skills_headers = ["skills", "technical skills", "core competencies", "areas of expertise", "proficiencies", "abilities"]
    stop_headers = ["experience", "education", "projects", "certifications", "work history", "professional experience"]
    
    section_text = extract_section(text, skills_headers, stop_headers)
    extracted_skills = set()
    
    if section_text:
        # Split the section into lines.
        lines = section_text.split("\n")
        for line in lines:
            # Remove bullet points and extra whitespace.
            line = re.sub(r'^[\-\*\•\s]+', '', line.strip())
            if not line:
                continue
            # Split by commas or semicolons.
            tokens = re.split(r',|;|\([^)]*\)', line)
            
            for token in tokens:
                # If token contains a colon, take the part after the colon; otherwise, just strip the token.
                token = token.split(":", 1)[-1].strip() if ":" in token else token.strip()
                token = token.strip('"')  # Remove any leading/trailing double quotes
                if token:
                    print(repr(token))  # Debug: view the exact string with hidden characters
                    extracted_skills.add(token)

    
    # Fallback: If no dedicated section is found and a job description is provided,
    # search the entire text for each expected skill.
    if not extracted_skills and job_description:
        for js in job_description:
            pattern = re.compile(re.escape(js), re.IGNORECASE)
            if pattern.search(text):
                print(f"Found skill: {js}")
                extracted_skills.add(js)
    
    # If a job_description list is provided, filter the extracted skills
    # so that only those matching the expected skills are returned.
    if job_description and extracted_skills:
        filtered_skills = set()
        for js in job_description:
            for skill in extracted_skills:
                if " " in skill:
                    threshold = 0.7
                    if len(skill) > len(js):
                        max_length_diff = abs(len(skill) - len(js)) +1
                    else:
                        max_length_diff = abs(len(js) - len(skill)) +1
                elif len(js) == 1 or len(skill) == 1:
                    threshold = 1
                    max_length_diff = 0
                else:
                    threshold = 0.95
                    max_length_diff = 3
                if similar(skill.lower(), js.lower(), threshold) or (
                abs(len(skill) - len(js)) < max_length_diff and (js.lower() in skill.lower() or skill.lower() in js.lower())
                ):
                    print(f"Matched skill: {skill} -> {js}")
                    filtered_skills.add(js)
                else: 
                    normalized_skill = normalize_skill(skill,)
                    normalized_js = normalize_skill(js)

                    if normalized_skill == normalized_js:
                        print(f"Normalized and Matched skill: {skill} -> {normalized_js}")
                        filtered_skills.add(normalized_skill)
                        continue
        if filtered_skills:
            return list(filtered_skills)
    
    return list(extracted_skills)       

def normalize_skill(skill):
    skill_lower = skill.lower().strip()
    if re.search(r'\.', skill_lower):
        # You can choose to remove the suffix if it matches a pattern (e.g., letters or digits)
        skill_lower = re.sub(r'\.[a-z0-9]+$', '', skill_lower)
    for canonical, variations in normalization_dict.items():
        if skill_lower in variations:
            return canonical
    return skill_lower  # if not found, return the original normalized value

normalization_dict = {
    "sql": {"postgresql", "mysql", "mssql", "oracle sql"},
    "javascript": {"js", "ecmascript","JavaScript (ES6+)"},  # adjust as needed
    # Add more skills as required...
}

def extract_resume_details(text, job_description):
    # text = extract_text_from_file(file_path)
    # if not text:
    #     print("Text extraction failed.")
    #     return False
    
    name, email, phone = extract_details(text)
    if not name or not email or not phone:
        print("Name, email, or phone number not found.")
        return False
        
    final_skills = extract_skills(text, job_description)
    # If more skills are extracted using the job description than previous iterations, use these.
        
    # If no skills were extracted via matching with a job description, try to extract all skills.
    if not final_skills:
        final_skills = set(extract_skills(text))
        
    if not final_skills:
        print("Skills not found.")
        return False
        
    # Print extracted details.
    print(f"Name: {name}")
    print(f"Email: {email}")
    print(f"Phone: {phone}")
    print("Skills:")
    for skill in final_skills:
        print(f"- {skill}")    

text = "Name : Ayush Sharma\n Email : example@gmail.com\n Phone : 1234567890\n My skills are :\n Node.js, Redux, HTML, CSS, Frontend, UI/UX, PostgreSQL, JavaScript (ES6+), •	AWS (EC2, S3, Lambda, RDS), timepass skilss, Angular, C#"
job_description = ["Redux", "TypeScript", "HTML", "CSS", "Frontend", "UI/UX", "React", "SQL", "AWS", "Timepass passing skillss", "Node", "AngularJS","C"]
extract_resume_details(text,job_description)

