import unittest

from backend.app import app, validate_target


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

    def test_dns_endpoint_rejects_invalid_input(self):
        response = self.client.post("/api/dns", json={"target": "not a domain"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["success"])


if __name__ == "__main__":
    unittest.main()
