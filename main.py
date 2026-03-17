from backend.server import create_mycoin_server

if __name__ == '__main__':
    create_mycoin_server.run(debug=True, host='0.0.0.0', port=5000)
