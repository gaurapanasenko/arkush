def main() -> None:
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(prog="arkush")
    parser.add_argument("-p", "--port", type=int, default=8000, help="port (default: 8000)")
    args = parser.parse_args()

    uvicorn.run("arkush.server:app", host="127.0.0.1", port=args.port, reload=True)
