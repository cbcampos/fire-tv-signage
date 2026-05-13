#!/usr/bin/env python3
"""
ESV Scripture Lookup Tool
Fetches passages from the ESV API for embedding in documents.
"""

import sys
import os
import json
import argparse
import requests

TOKEN_FILE = os.path.expanduser("~/.openclaw/.secrets/esv.env")

def load_token():
    with open(TOKEN_FILE) as f:
        for line in f:
            if line.startswith("ESV_API_TOKEN="):
                return line.split("=", 1)[1].strip()
    raise ValueError("ESV_API_TOKEN not found in secrets")

def fetch_passage(query, html=False, full=False):
    token = load_token()
    
    params = {
        "q": query,
        "include-passage-references": "true",
        "include-verse-numbers": "true",
        "include-short-copyright": "true" if not full else "false",
        "include-footnotes": "false",
        "include-headings": "true" if full else "false",
    }
    
    if html:
        params["include-passage-references"] = "false"
    
    headers = {
        "Authorization": f"Token {token}",
        "Accept": "application/json"
    }
    
    resp = requests.get(
        "https://api.esv.org/v3/passage/text/",
        params=params,
        headers=headers,
        timeout=15
    )
    
    if resp.status_code != 200:
        raise RuntimeError(f"ESV API error {resp.status_code}: {resp.text}")
    
    data = resp.json()
    
    if full:
        return data
    
    passages = data.get("passages", [])
    if not passages:
        return None
    
    text = passages[0].strip()
    query_ref = data.get("canonical", query)
    
    if html:
        verses_text = text.replace(f"({query_ref} ESV)\n\n", "").replace(f"({query_ref} ESV)", "")
        verses_text = verses_text.strip()
        paras = []
        for para in verses_text.split("\n\n"):
            para = para.strip()
            if para:
                paras.append(f"<p>{para}</p>")
        return {
            "reference": query_ref,
            "html": "\n".join(paras),
            "text": verses_text
        }
    
    return {
        "reference": query_ref,
        "text": text
    }

def format_text(result):
    text = result["text"]
    ref = result["reference"]
    out = f"{ref} (ESV)\n\n"
    text = text.replace(f"({ref} ESV)\n\n", "")
    out += text.strip()
    return out

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ESV Scripture Lookup")
    parser.add_argument("passage", nargs="+", help="Passage reference(s)")
    parser.add_argument("--html", action="store_true", help="Output HTML fragments")
    parser.add_argument("--full", action="store_true", help="Include metadata and copyright")
    parser.add_argument("--quiet", action="store_true", help="Output raw text only, no reference header")
    
    args = parser.parse_args()
    query = " ".join(args.passage)
    
    try:
        result = fetch_passage(query, html=args.html, full=args.full)
        
        if args.html:
            print(result["html"])
        elif args.quiet:
            print(result["text"].replace(f"({result['reference']} ESV)\n\n", "").strip())
        else:
            print(format_text(result))
    
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)