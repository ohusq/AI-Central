(function () {
  'use strict';

  var CACHE_TTL = 30 * 60 * 1000;
  var weatherCache = null;
  var weatherCacheTime = 0;

  async function fetchWeather() {
    if (weatherCache && Date.now() - weatherCacheTime < CACHE_TTL) return weatherCache;
    try {
      var res = await fetch('https://wttr.in/?format=%C|%t|%l', { signal: AbortSignal.timeout(4000) });
      var text = await res.text();
      var parts = text.split('|').map(function (s) { return s.trim(); });
      if (parts.length >= 3) {
        var tempMatch = parts[1].match(/-?\d+/);
        weatherCache = { condition: parts[0], temperature: tempMatch ? tempMatch[0] : '?', location: parts[2] };
        weatherCacheTime = Date.now();
      }
    } catch (e) {}
    return weatherCache;
  }

  function getContext() {
    var h = new Date().getHours();
    var day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    var m = new Date().getMonth();
    var season = m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
    var tod = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night';
    return { hour: h, day: day, season: season, tod: tod };
  }

  function tempNum(t) { return parseInt(t, 10); }
  function cond(t) { return (t || '').toLowerCase(); }

  function pickWeighted(items) {
    var total = items.reduce(function (sum, item) { return sum + item.w; }, 0);
    var rand = Math.random() * total;
    for (var i = 0; i < items.length; i++) {
      rand -= items[i].w;
      if (rand <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  window.getGreeting = async function () {
    var ctx = getContext();
    var weather = await fetchWeather();
    ctx.weather = weather;

    var pool = [];

    // Time of day (4)
    pool.push({ fn: function () { return 'Good ' + ctx.tod + '! \u2600\uFE0F Ready to make today productive?'; }, w: 2 });
    if (ctx.tod === 'morning') pool.push({ fn: function () { return 'Morning! Hope you had a good night\'s rest.'; }, w: 1 });
    if (ctx.tod === 'afternoon') pool.push({ fn: function () { return 'Afternoon vibes. Let\'s get things done.'; }, w: 1 });
    if (ctx.tod === 'evening') pool.push({ fn: function () { return 'Evening wind-down mode. What\'s on your mind?'; }, w: 1 });
    if (ctx.tod === 'night') pool.push({ fn: function () { return 'Late night thinker, huh? I\'m here for it. \u{1f319}'; }, w: 1 });

    // Day of week (4)
    if (ctx.day === 'Monday') pool.push({ fn: function () { return 'Monday mode: let\'s ease into this week together.'; }, w: 2 });
    if (ctx.day === 'Friday') pool.push({ fn: function () { return 'Happy Friday! \u{1f389} Anything exciting planned for the weekend?'; }, w: 2 });
    if (ctx.day === 'Saturday' || ctx.day === 'Sunday') pool.push({ fn: function () { return 'Weekend mode: relaxed and ready. What\'s happening?'; }, w: 2 });
    if (!['Monday', 'Friday', 'Saturday', 'Sunday'].includes(ctx.day)) pool.push({ fn: function () { return 'Happy ' + ctx.day + '! Let\'s make it a good one.'; }, w: 1 });

    // Seasonal (4)
    if (ctx.season === 'spring') pool.push({ fn: function () { return 'Spring is in the air \u{1f338}. Time for fresh ideas.'; }, w: 2 });
    if (ctx.season === 'summer') pool.push({ fn: function () { return 'Summer vibes \u2600\uFE0F \u2014 let\'s make today count.'; }, w: 2 });
    if (ctx.season === 'autumn') pool.push({ fn: function () { return 'Autumn feels \u{1f342}. Cozy up and let\'s explore something.'; }, w: 2 });
    if (ctx.season === 'winter') pool.push({ fn: function () { return 'Winter mode \u2744\uFE0F. Hot cocoa and deep questions \u2014 the perfect combo.'; }, w: 2 });

    // Weather-based (up to ~8)
    if (weather && weather.temperature) {
      var t = tempNum(weather.temperature);
      var c = cond(weather.condition);
      var loc = weather.location;

      if (t < 10) {
        pool.push({ fn: function () { return 'Brr, it\'s ' + weather.temperature + '\u00B0C in ' + loc + '. Stay warm! \u2615'; }, w: 2 });
        pool.push({ fn: function () { return 'Seems cold today right? \u2744\uFE0F ' + weather.condition + ' and ' + weather.temperature + '\u00B0C outside.'; }, w: 3 });
      } else if (t > 28) {
        pool.push({ fn: function () { return 'It\'s ' + weather.temperature + '\u00B0C in ' + loc + '. Hot day \u2014 stay hydrated! \u{1f4a7}'; }, w: 2 });
        pool.push({ fn: function () { return 'Seems hot today right? \u2600\uFE0F ' + weather.condition + ' and ' + weather.temperature + '\u00B0C out there.'; }, w: 3 });
      } else {
        pool.push({ fn: function () { return 'Perfect ' + weather.condition.toLowerCase() + ' day with ' + weather.temperature + '\u00B0C in ' + loc + '.'; }, w: 2 });
      }

      if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) {
        pool.push({ fn: function () { return 'Rainy day in ' + loc + ' \u2614. Perfect excuse to stay in and chat.'; }, w: 2 });
      }
      if (c.includes('snow') || c.includes('blizzard')) {
        pool.push({ fn: function () { return 'Snow day in ' + loc + '! \u2744\uFE0F Cozy vibes only.'; }, w: 2 });
      }
      if (c.includes('sun') || c.includes('clear')) {
        pool.push({ fn: function () { return 'Beautiful ' + weather.condition.toLowerCase() + ' day in ' + loc + '. Let\'s make the most of it.'; }, w: 2 });
      }
      if (c.includes('cloud') || c.includes('overcast') || c.includes('mist') || c.includes('fog')) {
        pool.push({ fn: function () { return weather.condition + ' over ' + loc + '. Cozy chat weather for sure.'; }, w: 2 });
      }

      pool.push({ fn: function () { return 'Right now it\'s ' + weather.condition.toLowerCase() + ' and ' + weather.temperature + '\u00B0C in ' + loc + '.'; }, w: 1 });
    }

    // General welcome (6)
    pool.push({ fn: function () { return 'Welcome back! Great to see you. \u{1f60a}'; }, w: 3 });
    pool.push({ fn: function () { return 'New conversation, new possibilities. Where shall we start?'; }, w: 2 });
    pool.push({ fn: function () { return 'Here we go again \u2014 let\'s build something great together.'; }, w: 1 });
    pool.push({ fn: function () { return 'I\'m all ears. What\'s on your mind today?'; }, w: 2 });
    pool.push({ fn: function () { return 'Ready when you are. What shall we explore?'; }, w: 1 });
    pool.push({ fn: function () { return 'The world\'s full of questions. Let\'s find some answers.'; }, w: 1 });

    var chosen = pickWeighted(pool);
    return chosen.fn();
  };

})();
