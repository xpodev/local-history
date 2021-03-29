import socket

s = socket.socket(socket.AF_INT, socket.SOCK_STREAM)

s.bind(("0.0.0.0", 5000))
s.listen()

while True:
    conn, addr = s.accept()
    data = conn.recv(4096)
    if data:
        print(data.decode())
        conn.send(data)

#this is a comment

def handler(data):
    if data == "cmd1":
        print("cmd 1")