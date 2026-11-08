"""Turns failed tests in .trx files into GitHub error annotations, so they show on the PR's Checks page."""

import pathlib
import sys
import xml.etree.ElementTree as ET

NS = {"t": "http://microsoft.com/schemas/VisualStudio/TeamTest/2010"}


def escape(text: str) -> str:
    return text.replace("%", "%25").replace("\r", "").replace("\n", "%0A")


def main(folder: str) -> None:
    failures = 0
    for trx in pathlib.Path(folder).glob("**/*.trx"):
        root = ET.parse(trx).getroot()
        for result in root.iterfind(".//t:UnitTestResult", NS):
            if result.get("outcome") != "Failed":
                continue
            failures += 1
            message = result.findtext(".//t:ErrorInfo/t:Message", default="", namespaces=NS)
            stack = result.findtext(".//t:ErrorInfo/t:StackTrace", default="", namespaces=NS)
            detail = (message + "\n" + "\n".join(stack.splitlines()[:6]))[:3000]
            print(f"::error title={escape(result.get('testName', 'test'))}::{escape(detail)}")
    print(f"{failures} failing test(s)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "TestResults")
