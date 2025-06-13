import requests
import time
import json

# Set up the Wordnik API base URL and your API key
API_KEY = "YOUR_API_KEY"
BASE_URL = "https://api.wordnik.com/v4/word.json/"

# List of words to fetch data for
words = ["食べる", "食", "食事", "食堂", "食欲"]

# Function to fetch data for each word from the Wordnik API
def fetch_word_data(word):
    url = f"{BASE_URL}{word}/definitions?api_key={API_KEY}"

    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for HTTP errors

        # If successful, parse the response and print it
        data = response.json()
        if data:  # If data is not empty
            print(f"Definitions for {word}:")
            for definition in data:
                print(f"- {definition['text']}")
        else:
            print(f"No definitions found for {word}.")
    except requests.exceptions.RequestException as e:
        print(f"Error during API request for {word}: {e}")

# Main loop to fetch data for each word
for word in words:
    print(f"Fetching data for {word}...\n")
    fetch_word_data(word)
    print("=" * 50)  # Separator for readability
    time.sleep(1)  # Pause to avoid hitting the API rate limit
