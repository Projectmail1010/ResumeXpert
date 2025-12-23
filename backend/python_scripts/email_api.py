import sys
sys.path.insert(0, 'path/to/my/custom/folder')
from flask import Flask, jsonify
import threading
import time
import imaplib
import email
import os
import re
from email.header import decode_header
import psycopg2
from extract_details import extract_resume_details
from email.header import decode_header
from flask_cors import CORS


# Resume folder (Auto-create if not exists)
RESUME_FOLDER = "resumes"
os.makedirs(RESUME_FOLDER, exist_ok=True)

# Flask app
app = Flask(__name__)
CORS(app) #Allow all origins
# Thread control
email_thread = None
stop_event = threading.Event()

def connect_email(EMAIL_USER, EMAIL_PASS):
    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    mail.login(EMAIL_USER, EMAIL_PASS)
    return mail

def fetch_new_emails(mail):
    mail.select("inbox")
    status, messages = mail.search(None, "UNSEEN")
    if status != "OK":
        return []
    return messages[0].split()

def mark_as_read(mail, mail_id):
    mail.store(mail_id, "+FLAGS", "\\Seen")

def process_email(mail, mail_id, company_name):
    status, msg_data = mail.fetch(mail_id, "(RFC822)")
    for response_part in msg_data:
        if isinstance(response_part, tuple):
            msg = email.message_from_bytes(response_part[1])
            subject, encoding = decode_header(msg["Subject"])[0]

            if isinstance(subject, bytes):
                subject = subject.decode(encoding if encoding else "utf-8")
            elif subject is None:
                subject = "No Subject"

            sender = msg.get("From")
            email_match = re.search(r"<([^>]+)>", sender)
            sender_email = email_match.group(1) if email_match else sender

            if msg.is_multipart():
                for part in msg.walk():
                    content_disposition = str(part.get("Content-Disposition"))
                    if "attachment" in content_disposition:
                        filename = part.get_filename()
                        if filename and ("resume" in filename.lower()):
                            if filename.endswith(".pdf") or filename.endswith(".docx"):
                                file_path = os.path.join(RESUME_FOLDER, filename)
                                with open(file_path, "wb") as f:
                                    f.write(part.get_payload(decode=True))
                                print(f"✅ Resume Found: {filename}")
                                mark_as_read(mail, mail_id)
                                                              
                                if extract_resume_details(filename, file_path, company_name):
                                    print(f"Resume Selected.")
                                else:
                                    print(f"Resume Rejected.")                       
                                        

def fetch_all_users():
    # Connects to the PostgreSQL database and retrieves all users.
    # Returns a list of tuples containing (company_name, work_email, email_app_key).
    connection = psycopg2.connect(
        host="localhost",
        user="postgres",
        password="Ayush123",
        dbname="jobs"
    )
    cursor = connection.cursor()
    cursor.execute("SELECT company, work_email, email_app_key FROM users")
    users = cursor.fetchall()
    return users, cursor

def email_listener():
    
    # Continuously fetches all users from the database and checks for new emails for each user.
    while not stop_event.is_set():
        users, cursor = fetch_all_users()
        for user in users:
            company_name, work_email, email_app_key = user
            if not email_app_key:
                continue
            # Connect using the user's email and app key
            mail = connect_email(work_email, email_app_key)
            print(f"🔍 Checking for new emails for {company_name}...")
            mail_ids = fetch_new_emails(mail)
            for mail_id in mail_ids:
                process_email(mail, mail_id, company_name)
        time.sleep(10)

@app.route("/start", methods=["GET"])
def start_listener():
    global email_thread, stop_event
    if email_thread is None or not email_thread.is_alive():
        stop_event.clear()
        email_thread = threading.Thread(target=email_listener, daemon=True)
        email_thread.start()
        print("📩 Email listener started")
        return jsonify({"message": "📩 Email listener started"}), 200
    else:
        return jsonify({"message": "⏳ Listener is already running"}), 200

@app.route("/stop", methods=["GET"])
def stop_listener():
    global stop_event
    stop_event.set()
    return jsonify({"message": "🛑 Email listener stopping..."}), 200

@app.route("/status", methods=["GET"])
def status_listener():
    global email_thread
    status = "Running" if email_thread and email_thread.is_alive() else "Stopped"
    return jsonify({"status": status}), 200

if __name__ == "__main__":
    app.run(port=5001)
