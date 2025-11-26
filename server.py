import http.server
import socketserver
import json
import socket
import os
import uuid
from urllib.parse import urlparse, parse_qs

PORT = 8000
DB_FILE = "projects_db.json"

# specific logic to find local IP address for sharing
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

class ExpenseHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/share':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data)
                project_id = str(uuid.uuid4())[:8] # Short unique ID
                
                # Load existing db
                db = {}
                if os.path.exists(DB_FILE):
                    with open(DB_FILE, 'r', encoding='utf-8') as f:
                        try: db = json.load(f)
                        except: pass
                
                # Save new project
                db[project_id] = data
                with open(DB_FILE, 'w', encoding='utf-8') as f:
                    json.dump(db, f)
                
                # Respond
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                
                local_ip = get_local_ip()
                share_url = f"http://{local_ip}:{PORT}/?id={project_id}"
                
                response = {"url": share_url, "id": project_id}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_error(500, str(e))
        else:
            self.send_error(404)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/get':
            query = parse_qs(parsed.query)
            project_id = query.get('id', [None])[0]
            
            if project_id and os.path.exists(DB_FILE):
                with open(DB_FILE, 'r', encoding='utf-8') as f:
                    db = json.load(f)
                    project_data = db.get(project_id)
                    
                    if project_data:
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps(project_data).encode('utf-8'))
                        return
            
            self.send_error(404, "Project not found")
        else:
            # Default behavior: serve files (index.html)
            super().do_GET()

print(f"✅ Server started at http://localhost:{PORT}")
print(f"🌍 Shareable links will use IP: {get_local_ip()}")
print("Press Ctrl+C to stop.")

with socketserver.TCPServer(("", PORT), ExpenseHandler) as httpd:
    httpd.serve_forever()