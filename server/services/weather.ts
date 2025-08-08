// Get current location based on IP address
async function getCurrentLocation(): Promise<string> {
  try {
    // Try multiple geolocation services for redundancy
    const services = [
      {
        url: 'http://ip-api.com/json/',
        parser: (data: any) => data.city
      },
      {
        url: 'https://ipinfo.io/json?token=demo',
        parser: (data: any) => data.city
      },
      {
        url: 'https://geo.ipify.org/api/v1?apiKey=at_demo',
        parser: (data: any) => data.location?.city
      }
    ];
    
    for (const service of services) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(service.url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Jarvis-Voice-Assistant/1.0'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          const city = service.parser(data);
          
          if (city && typeof city === 'string' && city.trim().length > 0) {
            console.log(`Detected current location: ${city}`);
            return city.trim();
          }
        }
      } catch (error) {
        console.warn(`Geolocation service failed: ${service.url}`, error);
        continue;
      }
    }
    
    // If all services fail, try browser geolocation (if available in Node.js environment)
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            enableHighAccuracy: false
          });
        });
        
        // Reverse geocoding using coordinates (you'd need a separate service for this)
        // For now, we'll return coordinates as a fallback
        const { latitude, longitude } = position.coords;
        console.log(`Browser geolocation: ${latitude}, ${longitude}`);
        
        // You could integrate with a reverse geocoding service here
        // For now, we'll return a generic location
        return "Current Location";
      } catch (error) {
        console.warn("Browser geolocation failed:", error);
      }
    }
    
    throw new Error("Unable to determine current location");
  } catch (error) {
    console.error("Current location detection failed:", error);
    throw error;
  }
}

export async function getWeatherData(location: string = "New York"): Promise<{
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  location: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
}> {
  try {
    // Check if we have a valid API key
    const apiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY;
    
    // Enhanced API key validation
    if (!apiKey || apiKey === "demo_key" || apiKey.length < 10) {
      console.warn("Weather API key not configured properly. Using mock data.");
      console.warn("Please set WEATHER_API_KEY environment variable with a valid OpenWeatherMap API key");
      console.warn("Get your free API key from: https://openweathermap.org/api");
      
      // Return mock data for demo purposes
      return {
        temperature: 22,
        description: "Weather service unavailable - API key needed",
        humidity: 65,
        windSpeed: 10,
        location: location === "current" ? "Current Location" : location,
      };
    }
    
    console.log(`Using weather API key: ${apiKey.substring(0, 8)}...`);
    
    let actualLocation = location;
    
    // Handle "current" location request
    if (location === "current" || !location || location.trim() === "") {
      try {
        actualLocation = await getCurrentLocation();
      } catch (error) {
        console.warn("Could not determine current location, using default:", error);
        actualLocation = "New York"; // Fallback location
      }
    }
    
    // Validate location parameter
    if (!actualLocation || typeof actualLocation !== 'string' || actualLocation.trim().length === 0) {
      throw new Error("Invalid location parameter");
    }
    
    // Clean up the location string
    const cleanLocation = actualLocation.trim();
    
    // Try to get coordinates for the location (for more accurate weather)
    let coordinates: { lat: number; lon: number } | undefined;
    
    try {
      // First, try to get coordinates using geocoding
      const geocodingUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cleanLocation)}&limit=1&appid=${apiKey}`;
      
      const geoController = new AbortController();
      const geoTimeoutId = setTimeout(() => geoController.abort(), 5000);
      
      const geoResponse = await fetch(geocodingUrl, {
        signal: geoController.signal
      });
      
      clearTimeout(geoTimeoutId);
      
      if (geoResponse.ok) {
        const geoData = await geoResponse.json();
        if (geoData && geoData.length > 0) {
          coordinates = {
            lat: geoData[0].lat,
            lon: geoData[0].lon
          };
          console.log(`Found coordinates for ${cleanLocation}: ${coordinates.lat}, ${coordinates.lon}`);
        }
      }
    } catch (error) {
      console.warn("Geocoding failed, using city name only:", error);
    }
    
    let url: string;
    if (coordinates) {
      // Use coordinates for more accurate weather data
      url = `https://api.openweathermap.org/data/2.5/weather?lat=${coordinates.lat}&lon=${coordinates.lon}&appid=${apiKey}&units=metric`;
    } else {
      // Fall back to city name
      url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cleanLocation)}&appid=${apiKey}&units=metric`;
    }
    
    console.log(`Fetching weather data for: ${cleanLocation}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Jarvis-Voice-Assistant/1.0',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Weather API error (${response.status})`;
      
      // Provide more specific error messages based on status code
      switch (response.status) {
        case 401:
          errorMessage += ": Invalid API key - please check your WEATHER_API_KEY";
          break;
        case 404:
          errorMessage += ": Location not found";
          break;
        case 429:
          errorMessage += ": API rate limit exceeded";
          break;
        case 500:
          errorMessage += ": Weather service internal error";
          break;
        default:
          errorMessage += `: ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    
    // Validate the response structure
    if (!data || typeof data !== 'object') {
      throw new Error("Invalid response: Expected JSON object");
    }
    
    if (!data.main || typeof data.main !== 'object') {
      throw new Error("Invalid weather data: Missing main weather data");
    }
    
    if (!data.weather || !Array.isArray(data.weather) || data.weather.length === 0) {
      throw new Error("Invalid weather data: Missing weather description");
    }
    
    if (!data.name || typeof data.name !== 'string') {
      throw new Error("Invalid weather data: Missing location name");
    }
    
    // Extract and validate temperature
    const temperature = typeof data.main.temp === 'number' ? data.main.temp : null;
    if (temperature === null || isNaN(temperature)) {
      throw new Error("Invalid weather data: Invalid temperature value");
    }
    
    // Extract and validate humidity
    const humidity = typeof data.main.humidity === 'number' ? data.main.humidity : null;
    if (humidity === null || isNaN(humidity)) {
      throw new Error("Invalid weather data: Invalid humidity value");
    }
    
    // Extract and validate wind speed
    const windSpeed = typeof data.wind?.speed === 'number' ? data.wind.speed : 0;
    
    // Extract weather description
    const description = typeof data.weather[0].description === 'string' 
      ? data.weather[0].description 
      : "Unknown weather conditions";
    
    // Get coordinates from response if not already obtained
    if (!coordinates && data.coord) {
      coordinates = {
        lat: data.coord.lat,
        lon: data.coord.lon
      };
    }
    
    const result = {
      temperature: Math.round(temperature),
      description: description.charAt(0).toUpperCase() + description.slice(1), // Capitalize first letter
      humidity: Math.round(humidity),
      windSpeed: Math.round(windSpeed * 3.6), // Convert m/s to km/h
      location: data.name,
      coordinates: coordinates
    };
    
    console.log(`Weather data retrieved successfully for ${result.location}: ${result.temperature}°C, ${result.description}`);
    
    return result;
  } catch (error) {
    console.error("Weather API error:", error);
    
    // Return fallback data with a clear indication that it's not real
    return {
      temperature: 22,
      description: "Weather service unavailable",
      humidity: 65,
      windSpeed: 10,
      location: location === "current" ? "Current Location" : location,
    };
  }
}

// Additional utility function for weather forecasts
export async function getWeatherForecast(location: string = "New York", days: number = 5): Promise<{
  location: string;
  forecast: Array<{
    date: string;
    temperature: {
      min: number;
      max: number;
    };
    description: string;
    humidity: number;
    windSpeed: number;
  }>;
}> {
  try {
    const apiKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY;
    
    if (!apiKey || apiKey === "demo_key") {
      console.warn("No valid weather API key found. Using mock forecast data.");
      // Return mock forecast data
      const mockForecast = [];
      const today = new Date();
      
      for (let i = 0; i < Math.min(days, 5); i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        mockForecast.push({
          date: date.toISOString().split('T')[0],
          temperature: {
            min: 15 + Math.floor(Math.random() * 10),
            max: 20 + Math.floor(Math.random() * 10),
          },
          description: ["Sunny", "Partly cloudy", "Cloudy", "Rainy"][Math.floor(Math.random() * 4)],
          humidity: 50 + Math.floor(Math.random() * 40),
          windSpeed: 5 + Math.floor(Math.random() * 15),
        });
      }
      
      return {
        location: location,
        forecast: mockForecast,
      };
    }
    
    // Handle "current" location for forecast
    let actualLocation = location;
    if (location === "current" || !location || location.trim() === "") {
      try {
        actualLocation = await getCurrentLocation();
      } catch (error) {
        console.warn("Could not determine current location for forecast, using default:", error);
        actualLocation = "New York"; // Fallback location
      }
    }
    
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(actualLocation)}&appid=${apiKey}&units=metric`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Weather forecast API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Process forecast data (OpenWeatherMap returns 3-hour intervals)
    const dailyForecasts: Record<string, any> = {};
    
    data.list.forEach((item: any) => {
      const date = item.dt_txt.split(' ')[0];
      
      if (!dailyForecasts[date]) {
        dailyForecasts[date] = {
          temps: [],
          descriptions: [],
          humidity: [],
          windSpeed: [],
        };
      }
      
      dailyForecasts[date].temps.push(item.main.temp);
      dailyForecasts[date].descriptions.push(item.weather[0].description);
      dailyForecasts[date].humidity.push(item.main.humidity);
      dailyForecasts[date].windSpeed.push(item.wind.speed);
    });
    
    const forecast = Object.entries(dailyForecasts)
      .slice(0, days)
      .map(([date, data]: [string, any]) => ({
        date,
        temperature: {
          min: Math.round(Math.min(...data.temps)),
          max: Math.round(Math.max(...data.temps)),
        },
        description: getMostCommon(data.descriptions),
        humidity: Math.round(data.humidity.reduce((a: number, b: number) => a + b, 0) / data.humidity.length),
        windSpeed: Math.round((data.windSpeed.reduce((a: number, b: number) => a + b, 0) / data.windSpeed.length) * 3.6),
      }));
    
    return {
      location: data.city.name,
      forecast,
    };
  } catch (error) {
    console.error("Weather forecast API error:", error);
    throw error;
  }
}

// Helper function to get most common string in array
function getMostCommon(arr: string[]): string {
  const frequency: Record<string, number> = {};
  let maxFreq = 0;
  let mostCommon = "";
  
  for (const item of arr) {
    frequency[item] = (frequency[item] || 0) + 1;
    if (frequency[item] > maxFreq) {
      maxFreq = frequency[item];
      mostCommon = item;
    }
  }
  
  return mostCommon;
}