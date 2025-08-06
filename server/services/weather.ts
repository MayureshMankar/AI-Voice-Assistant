export async function getWeatherData(location: string = "New York"): Promise<{
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  location: string;
}> {
  try {
    // Using OpenWeatherMap API - get API key from environment
    const apiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY || "demo_key";
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      temperature: Math.round(data.main.temp),
      description: data.weather[0].description,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed * 3.6), // Convert m/s to km/h
      location: data.name,
    };
  } catch (error) {
    // Fallback for demo purposes or if API fails
    console.error("Weather API error:", error);
    return {
      temperature: 22,
      description: "Weather data unavailable",
      humidity: 65,
      windSpeed: 10,
      location: location,
    };
  }
}
