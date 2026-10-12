#!/usr/bin/env python3
"""Forward <bridge-ip>:9200 -> 127.0.0.1:9200.

The dev-tree node binds loopback only, so containers can't reach it via
host.docker.internal (= the docker0 gateway). This makes it reachable without
restarting the node (which would wipe the testclusters data dir).
"""
import socket, sys, threading

BIND, PORT, DST = sys.argv[1], 9200, ("127.0.0.1", 9200)


def pipe(a, b):
    try:
        while True:
            d = a.recv(65536)
            if not d:
                break
            b.sendall(d)
    except OSError:
        pass
    finally:
        for s in (a, b):
            try:
                s.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            s.close()


srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind((BIND, PORT))
srv.listen(128)
print(f"forwarding {BIND}:{PORT} -> {DST[0]}:{DST[1]}", flush=True)
while True:
    c, _ = srv.accept()
    try:
        u = socket.create_connection(DST, timeout=5)
    except OSError:
        c.close()
        continue
    threading.Thread(target=pipe, args=(c, u), daemon=True).start()
    threading.Thread(target=pipe, args=(u, c), daemon=True).start()
