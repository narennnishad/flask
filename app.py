import os
import uuid
import glob
from flask import Flask, render_template, request, send_file, jsonify, session
from PyPDF2 import PdfMerger, PdfReader
from werkzeug.utils import secure_filename
import shutil
from pdf2docx import Converter
import sys
import subprocess

# Try importing docx2pdf, handle failure (e.g. on non-Windows without Office)
try:
    from docx2pdf import convert as docx2pdf_convert
except ImportError:
    docx2pdf_convert = None

app = Flask(__name__)
app.secret_key = os.urandom(24)
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_session_folder():
    if 'uid' not in session:
        session['uid'] = str(uuid.uuid4())
    folder = os.path.join(UPLOAD_FOLDER, session['uid'])
    os.makedirs(folder, exist_ok=True)
    return folder

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_files():
    folder = get_session_folder()
    uploaded_files = []
    
    if 'files' not in request.files:
        return jsonify({'error': 'No files part'}), 400
        
    files = request.files.getlist('files')
    
    for file in files:
        if file.filename == '':
            continue
        if file and file.filename.lower().endswith('.pdf'):
            filename = secure_filename(file.filename)
            filepath = os.path.join(folder, filename)
            file.save(filepath)
            
            # Get page count
            try:
                reader = PdfReader(filepath)
                pages = len(reader.pages)
            except Exception:
                pages = '?'
                
            uploaded_files.append({
                'name': filename,
                'pages': pages
            })
            
    return jsonify({'files': uploaded_files})

@app.route('/merge', methods=['POST'])
def merge_files():
    folder = get_session_folder()
    data = request.json
    files_data = data.get('files', [])  # Expecting list of objects: {filename, ranges}
    
    if not files_data:
        # Fallback for old format (just filenames)
        filenames = data.get('filenames', [])
        if filenames:
            files_data = [{'filename': f, 'ranges': ''} for f in filenames]
        else:
            return jsonify({'error': 'No files specified'}), 400

    merger = PdfMerger()
    output_filename = 'merged_document.pdf'
    output_path = os.path.join(folder, output_filename)
    
    try:
        for file_info in files_data:
            filename = secure_filename(file_info['filename'])
            ranges = file_info.get('ranges', '').strip()
            filepath = os.path.join(folder, filename)
            
            if not os.path.exists(filepath):
                return jsonify({'error': f'File {filename} not found'}), 404

            # If no range specified, append whole file
            if not ranges:
                merger.append(filepath)
            else:
                # Parse ranges
                # Format: "1, 3-5, 8" -> pages 0, 2, 3, 4, 7
                # We need to handle this carefully.
                # PdfMerger.append(fileobj, pages=...) takes (start, stop[, step]) or a PageRange object.
                # It does NOT take a list of arbitrary indices.
                # So we must iterate through our parsed ranges and append them one by one.
                
                # Let's get total pages first to validate
                reader = PdfReader(filepath)
                num_pages = len(reader.pages)
                
                page_groups = parse_page_ranges(ranges, num_pages)
                
                for start, end in page_groups:
                    merger.append(filepath, pages=(start, end))
                
        merger.write(output_path)
        merger.close()
        
        return jsonify({'download_url': f'/download/{output_filename}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def parse_page_ranges(range_str, max_pages):
    """
    Parses string like "1, 3-5, 8" into list of (start, end) tuples.
    All input is 1-based, output is 0-based.
    Returns: [(0, 1), (2, 5), (7, 8)]
    """
    groups = []
    parts = [p.strip() for p in range_str.split(',')]
    
    for part in parts:
        if '-' in part:
            try:
                start_str, end_str = part.split('-')
                start = int(start_str) - 1
                end = int(end_str)
                
                if start < 0: start = 0
                if end > max_pages: end = max_pages
                if start < end:
                    groups.append((start, end))
            except ValueError:
                continue
        else:
            try:
                page = int(part) - 1
                if 0 <= page < max_pages:
                    groups.append((page, page + 1))
            except ValueError:
                continue
                
    return groups

@app.route('/convert/pdf-to-docx', methods=['POST'])
def convert_pdf_to_docx():
    folder = get_session_folder()
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and file.filename.lower().endswith('.pdf'):
        filename = secure_filename(file.filename)
        pdf_path = os.path.join(folder, filename)
        docx_filename = os.path.splitext(filename)[0] + '.docx'
        docx_path = os.path.join(folder, docx_filename)
        
        file.save(pdf_path)
        
        try:
            cv = Converter(pdf_path)
            cv.convert(docx_path)
            cv.close()
            return jsonify({'download_url': f'/download/{docx_filename}'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/convert/docx-to-pdf', methods=['POST'])
def convert_docx_to_pdf():
    folder = get_session_folder()
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file and file.filename.lower().endswith('.docx'):
        filename = secure_filename(file.filename)
        docx_path = os.path.join(folder, filename)
        pdf_filename = os.path.splitext(filename)[0] + '.pdf'
        pdf_path = os.path.join(folder, pdf_filename)
        
        file.save(docx_path)
        
        try:
            if sys.platform == 'win32':
                # Windows: Attempt to use docx2pdf (requires Word)
                if docx2pdf_convert is None:
                     return jsonify({'error': 'DOCX to PDF on Windows requires Microsoft Word installed.'}), 501
                
                import pythoncom
                pythoncom.CoInitialize()
                docx2pdf_convert(docx_path, pdf_path)
            else:
                # Docker/Linux: Use LibreOffice
                lo_cmd = shutil.which('libreoffice') or shutil.which('soffice')
                if not lo_cmd:
                    raise Exception("LibreOffice not found. Please ensure you are using the Docker runtime on Render.")
                
                # libreoffice --headless --convert-to pdf --outdir <dir> <file>
                subprocess.run([lo_cmd, '--headless', '--convert-to', 'pdf', '--outdir', folder, docx_path], 
                               check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                
            if os.path.exists(pdf_path):
                return jsonify({'download_url': f'/download/{pdf_filename}'})
            else:
                 return jsonify({'error': 'Conversion failed: output file not found'}), 500

        except subprocess.CalledProcessError as e:
            return jsonify({'error': f"LibreOffice conversion failed. Ensure Docker is used. Error: {e.stderr.decode() if e.stderr else str(e)}"}), 500
        except Exception as e:
            return jsonify({'error': f"Conversion failed: {str(e)}"}), 500
            
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/download/<filename>')
def download_file(filename):
    folder = get_session_folder()
    filepath = os.path.join(folder, secure_filename(filename))
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True)
    return "File not found", 404

@app.route('/cleanup', methods=['POST'])
def cleanup():
    # Optional: Clear session files
    if 'uid' in session:
        folder = os.path.join(UPLOAD_FOLDER, session['uid'])
        if os.path.exists(folder):
            shutil.rmtree(folder)
    session.pop('uid', None)
    return jsonify({'status': 'cleaned'})

if __name__ == '__main__':
    app.run(debug=True)
