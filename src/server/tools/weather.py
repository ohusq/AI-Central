from urllib.parse import quote

from ..helpers import fetch_json
from .base import BaseTool


class WeatherTool(BaseTool):
    name = "weather"
    description = "Get current weather conditions for a location."

    def execute(self, args):
        location = args.get("location", "")
        url = "https://wttr.in/" + quote(location) + "?format=j1"
        data = fetch_json(url)
        cur = (data.get("current_condition") or [None])[0]
        area = (data.get("nearest_area") or [None])[0]
        if not cur:
            return "No weather data available."
        condition = (cur.get("weatherDesc") or [{}])[0].get("value", "unknown")
        temp = cur.get("temp_C", "?")
        feels = cur.get("FeelsLikeC", "?")
        humidity = cur.get("humidity", "?")
        wind = cur.get("windspeedKmph", "?")
        city = (area.get("areaName") or [{}])[0].get("value", "") if area else ""
        region = (area.get("region") or [{}])[0].get("value", "") if area else ""
        loc_parts = [p for p in [city, region] if p]
        location_str = ", ".join(loc_parts) if loc_parts else "your area"
        return (
            f"Weather in {location_str}: {condition}, {temp}°C "
            f"(feels like {feels}°C). Humidity: {humidity}%. Wind: {wind} km/h."
        )
