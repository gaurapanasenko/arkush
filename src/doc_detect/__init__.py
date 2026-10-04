def main() -> None:
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(prog="doc-detect")
    parser.add_argument("-p", "--port", type=int, default=8000, help="port (default: 8000)")
    args = parser.parse_args()

    uvicorn.run("doc_detect.server:app", host="127.0.0.1", port=args.port, reload=True)
