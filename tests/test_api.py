import unittest

from backend.app import app, parse_traceroute_output, validate_target


class InternetJourneyApiTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_health_endpoint(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")

    def test_private_ip_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_target("192.168.1.1")

    def test_loopback_ip_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_target("127.0.0.1")

    def test_invalid_domain_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_target("not a domain")

    def test_geolocation_skips_private_hop_ip(self):
        response = self.client.post("/api/geolocate", json={"ips": ["192.168.1.1"]})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["locations"][0]["available"])

    def test_geolocation_requires_ip_list(self):
        response = self.client.post("/api/geolocate", json={"ips": []})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])


    def test_traceroute_parser_handles_ipv4_and_latency(self):
        hops = parse_traceroute_output(
            "  1    2 ms    3 ms    4 ms    192.0.2.1\n"
            "  2    <1 ms    1 ms    2 ms    198.51.100.2"
        )
        self.assertEqual(len(hops), 2)
        self.assertEqual(hops[0]["ip"], "192.0.2.1")
        self.assertEqual(hops[0]["rtt_ms"], 3.0)
        self.assertEqual(hops[1]["ip"], "198.51.100.2")
        self.assertEqual(hops[1]["rtt_ms"], 1.33)

    def test_traceroute_parser_handles_ipv6_and_timeout(self):
        hops = parse_traceroute_output(
            "  1  2001:4860:4860::8888  5 ms\n"
            "  2  * * *"
        )
        self.assertEqual(hops[0]["ip"], "2001:4860:4860::8888")
        self.assertEqual(hops[1]["ip"], None)
        self.assertEqual(hops[1]["status"], "timeout")

    def test_homepage_is_served(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Internet Journey Visualizer", response.data)

    def test_geolocation_rejects_more_than_twenty_addresses(self):
        response = self.client.post("/api/geolocate", json={"ips": ["8.8.8.8"] * 21})
        self.assertEqual(response.status_code, 400)

    def test_dns_endpoint_rejects_invalid_input(self):
        response = self.client.post("/api/dns", json={"target": "not a domain"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])


if __name__ == "__main__":
    unittest.main()
