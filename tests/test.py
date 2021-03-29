import socket


def handler(data):
    cmd = data.decode()
    if cmd == "error":
        raise Exception("Whatever")
    if cmd == "cmd1":
        print("cmd 1")

s = socket.socket(socket.AF_INT, socket.SOCK_STREAM)

s.bind(("0.0.0.0", 5000))
s.listen()

while True:
    conn, addr = s.accept()
    data = conn.recv(4096)
    if data:
        print(data.decode())
        handler(data)
        conn.send(data)

#this is a comment