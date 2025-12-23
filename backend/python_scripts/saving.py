import os
from sqlalchemy import create_engine
from docx import Document
from pdfminer.high_level import extract_text
import psycopg2
from psycopg2 import sql

# app = Flask(__name__)
def read_pdf_file(pdf_path):
    try:
        with open(pdf_path, "rb") as file:
            return file.read()  # Read entire PDF as binary data
    except Exception as e:
        print(f"Error reading PDF file '{pdf_path}': {e}")
        return None

# Function to read data from DOC/DOCX file 
def read_doc_file(doc_path):
    try:
        with open(doc_path, "rb") as file:
            return file.read()  # Read entire DOC/DOCX file as binary data
    except Exception as e:
        print(f"Error reading DOC/DOCX file '{doc_path}': {e}")
        return None

        
#Function to store files in PostgreSQL
def store_files(cursor, company_name, name, email, phone_no, skills, file_name, file_content):
    """
    Stores file information in a table named '<company_name>_selected'.
    Expects an existing psycopg2 cursor (not a connection).
    Note: Transaction control (commit/rollback) should be handled outside this function.
    """
    # Construct the table name safely using psycopg2.sql.Identifier
    table = sql.Identifier(company_name + "_selected")
    existing_table  = sql.Identifier(company_name)
    
    create_table_query = sql.SQL("""
        CREATE TABLE IF NOT EXISTS {} (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone_no VARCHAR(20) NOT NULL,
            skills TEXT NOT NULL,  
            file_name TEXT NOT NULL,
            file_data BYTEA NOT NULL 
        );
    """).format(table, existing_table)
    
    insert_query = sql.SQL("""
        INSERT INTO {} (name, email, phone_no, skills, file_name, file_data)
        VALUES (%s, %s, %s, %s, %s, %s);
    """).format(table)
    
    try:
        cursor.execute(create_table_query)
        cursor.execute(insert_query, (name, email, phone_no, skills, file_name, file_content))
        cursor.connection.commit()
        print(f"File '{file_name}' stored in table '{company_name}_selected'.")
    except Exception as e:
        print(f"Failed to store file '{file_name}': {e}")

db_uri = "postgresql://postgres:Ayush123@localhost:5432/jobs"

def store_files_in_db(cursor, company_name, name, email, phone_no, skills, file_name,file_path):
    # Usage
    if not os.path.exists(file_path):
        print(f"Invalid file path: {file_path}")
        return
    if file_path.lower().endswith('.pdf'):
        file_content = read_pdf_file(file_path)
    elif file_path.lower().endswith(('.doc', '.docx')):
        file_content = read_doc_file(file_path)
    table_name = "selected_resumes"
    store_files(cursor, company_name, name, email, phone_no, skills, file_name,file_content)

# Ensure the table exists (run this in your database beforehand):
# CREATE TABLE selected_resumes (
#     id SERIAL PRIMARY KEY,
#     name VARCHAR(255) NOT NULL,
#     email VARCHAR(255) NOT NULL,
#     phone_no VARCHAR(20) NOT NULL,
#     skills TEXT NOT NULL,  -- Storing as a comma-separated string or JSON
#     file_name TEXT NOT NULL,
#     file_data BYTEA NOT NULL  -- Storing the resume file in binary format
# );


                    