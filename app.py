from flask import Flask, jsonify, render_template
import requests

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/energy")
def energy():
    return render_template("energy.html")

@app.route("/api/energy") # REST API endpoint for energy data
def energy_data():
    url = "https://api.worldbank.org/v2/country/all/indicator/EG.USE.PCAP.KG.OE?format=json&per_page=5000"
    response = requests.get(url)
    data = response.json()

    latest_by_entity = {}

    for item in data[1]:
        code = item["country"]["id"]
        value = item["value"]
        year = int(item["date"])

        if value is None:
            continue
        if code not in latest_by_entity or year > int(latest_by_entity[code]["year"]):
            latest_by_entity[code] = {
                "country": item["country"]["value"],
                "year": year,
                "energy_use": value
            }

    results = list(latest_by_entity.values())
    return jsonify(results)

if __name__ == "__main__":
    app.run(debug=True)