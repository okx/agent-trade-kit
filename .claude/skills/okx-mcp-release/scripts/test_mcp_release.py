"""Tests for mcp_release.py — uses stdlib unittest, no external deps."""

import json
import unittest
from unittest.mock import MagicMock, patch

import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from mcp_release import fetch_remote_tools, RemoteFetchError


class TestFetchRemote(unittest.TestCase):
    def test_fetch_success(self):
        fake_response = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "tools": [
                    {
                        "name": "spot_place_order",
                        "description": "Place a spot order.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "instId": {"type": "string", "description": "Instrument ID"}
                            },
                            "required": ["instId"]
                        }
                    }
                ]
            }
        }).encode()

        mock_resp = MagicMock()
        mock_resp.read.return_value = fake_response
        mock_resp.__enter__.return_value = mock_resp

        with patch("urllib.request.urlopen", return_value=mock_resp):
            tools = fetch_remote_tools("http://fake/mcp")

        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0]["name"], "spot_place_order")

    def test_fetch_http_error_raises(self):
        with patch("urllib.request.urlopen", side_effect=OSError("conn refused")):
            with self.assertRaises(RemoteFetchError):
                fetch_remote_tools("http://fake/mcp")


if __name__ == "__main__":
    unittest.main()
