"""Local development entry point. Run: `python main.py` then open http://localhost:8000"""
import uvicorn

from api.index import app as app  # re-export so `uvicorn main:app` also works

if __name__ == "__main__":
    uvicorn.run("api.index:app", host="127.0.0.1", port=8000, reload=True)
