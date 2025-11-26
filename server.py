import http.server
import socketserver
import json
import socket
import os
import uuid
from urllib.parse import urlparse, parse_qs

PORT = 8000
DB_FILE = "projects_db.json"

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Connect to a dummy address to find the interface IP
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

class ExpenseHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        # Handle Saving/Updating
        if self.path == '/api/save':
            length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(length)
            
            try:
                request_payload = json.loads(post_data)
                
                # Load existing DB
                db = {}
                if os.path.exists(DB_FILE):
                    with open(DB_FILE, 'r', encoding='utf-8') as f:
                        try: db = json.load(f)
                        except: pass
                
                # Determine ID (Existing or New)
                project_id = request_payload.get('id')
                if not project_id:
                    project_id = str(uuid.uuid4())[:8] # Generate new short ID
                
                # Update Data
                db[project_id] = request_payload.get('data')
                
                with open(DB_FILE, 'w', encoding='utf-8') as f:
                    json.dump(db, f)
                
                # Send Response
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                response = {"success": True, "id": project_id}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_error(500, str(e))
        else:
            self.send_error(404)

    def do_GET(self):
        parsed = urlparse(self.path)
        
        # Handle Loading
        if parsed.path == '/api/get':
            query = parse_qs(parsed.query)
            project_id = query.get('id', [None])[0]
            
            if project_id and os.path.exists(DB_FILE):
                with open(DB_FILE, 'r', encoding='utf-8') as f:
                    try:
                        db = json.load(f)
                        data = db.get(project_id)
                        if data:
                            self.send_response(200)
                            self.send_header('Content-type', 'application/json')
                            self.end_headers()
                            self.wfile.write(json.dumps(data).encode('utf-8'))
                            return
                    except: pass
            
            self.send_error(404, "Project not found")
        
        # Handle IP request for sharing link
        elif parsed.path == '/api/ip':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"ip": get_local_ip()}).encode('utf-8'))

        else:
            # Default: Serve static files (index.html)
            super().do_GET()

print(f"✅ Server running. Open http://localhost:{PORT}")
print("Press Ctrl+C to stop.")

with socketserver.TCPServer(("", PORT), ExpenseHandler) as httpd:
    httpd.serve_forever()