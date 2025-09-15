from flask import Flask, send_from_directory
import os

DIST_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")

app = Flask(__name__, static_folder=DIST_DIR, static_url_path="")

# Serve index.html for root
@app.route("/")
def serve_index():
    return send_from_directory(DIST_DIR, "index.html")

# Serve all other files (JS, CSS, assets…)
@app.route("/<path:path>")
def serve_file(path):
    file_path = os.path.join(DIST_DIR, path)
    if os.path.exists(file_path):
        return send_from_directory(DIST_DIR, path)
    else:
        # fallback: if React/Vue router -> serve index.html
        return send_from_directory(DIST_DIR, "index.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
