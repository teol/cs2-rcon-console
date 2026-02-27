import time
from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to http://localhost:5173")
        try:
            # Go to the app
            page.goto("http://localhost:5173", timeout=60000)

            # Wait for key elements to ensure app loaded
            page.wait_for_selector(".header")
            page.wait_for_selector(".sidebar")
            page.wait_for_selector(".console-area")

            print("App loaded. Checking elements...")

            # Check for specific text
            content = page.content()
            assert "CS2 RCON" in content
            assert "Connection" in content
            assert "Console Output" in content

            # Type something in the connect form to show interactivity
            # Using specific selectors based on placeholder
            page.fill("input[placeholder='127.0.0.1']", "192.168.1.100")
            page.fill("input[placeholder='27015']", "27016")
            page.fill("input[placeholder='••••••••']", "mypassword")

            # Note: The console input is disabled until connected, so we can't type there.
            # We can verify it is disabled though.
            is_disabled = page.is_disabled("#commandInput")
            print(f"Console input is disabled as expected: {is_disabled}")
            assert is_disabled

            print("Taking screenshot...")
            # Take a screenshot
            page.screenshot(path="verification/frontend_verification.png", full_page=True)

            print("Verification complete!")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error_screenshot.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_frontend()
