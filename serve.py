#!/usr/bin/env python3
"""
Run the SWEMA map on your own computer.

    python serve.py              # http://swema/  (port 80, falls back to 8080)
    python serve.py --port 8080  # http://swema:8080/
    python serve.py --no-browser

Addresses that work:
  • http://swema/            after running setup-swema-domain (adds "swema" to your hosts file)
  • http://swema.localhost/  works in Chrome, Edge and Firefox with no setup at all
  • http://localhost/        always works (use this for Google Earth Engine sign-in)

The server only listens on this computer (127.0.0.1); nobody else on the network can reach it.
"""
import argparse
import functools
import http.server
import os
import socket
import sys
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
NAME = "swema"


def hosts_entry_ok():
    """True when 'swema' resolves to this computer (the hosts file entry exists)."""
    try:
        return socket.gethostbyname(NAME) in ("127.0.0.1", "::1")
    except OSError:
        return False


def start_server(ports):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    for port in ports:
        try:
            return http.server.ThreadingHTTPServer(("127.0.0.1", port), handler), port
        except PermissionError:
            print(f"Port {port} needs administrator rights on this system - trying the next port.")
        except OSError as e:
            print(f"Port {port} is not available ({e.strerror}) - trying the next port.")
    return None, None


def main():
    p = argparse.ArgumentParser(description="Serve the SWEMA map at http://swema/")
    p.add_argument("--port", type=int, default=80, help="port to use (default 80; falls back to 8080, 8000)")
    p.add_argument("--no-browser", action="store_true", help="do not open a browser window")
    args = p.parse_args()

    ports = [args.port] + [x for x in (8080, 8000) if x != args.port]
    httpd, port = start_server(ports)
    if not httpd:
        sys.exit("Could not start the server: no free port. Close the other program or use --port 9000.")

    sfx = "" if port == 80 else f":{port}"
    ok = hosts_entry_ok()
    print("\n  SWEMA is running. Open one of these in your browser:\n")
    print(f"    http://{NAME}{sfx}/" + ("" if ok else "            (run setup-swema-domain first)"))
    print(f"    http://{NAME}.localhost{sfx}/   (no setup needed in Chrome, Edge, Firefox)")
    print(f"    http://localhost{sfx}/          (use this one for Google Earth Engine sign-in)")
    print("\n  Press Ctrl+C to stop.\n")

    if not args.no_browser:
        webbrowser.open(f"http://{NAME}{sfx}/" if ok else f"http://{NAME}.localhost{sfx}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
