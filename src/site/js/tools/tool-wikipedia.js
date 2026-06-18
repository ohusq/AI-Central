registerTool({
  name: "wikipedia",
  description:
    'Search Wikipedia or get a summary of a specific page. Use "search" to find pages by keyword, use "summary" to read a specific page.',
  icon: "W",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search", "summary"],
        description: '"search" to find pages, "summary" to get page content',
      },
      query: {
        type: "string",
        description: "Search term or exact page title",
      },
      limit: {
        type: "number",
        description: "Number of search results (max 10)",
        default: 5,
      },
    },
    required: ["action", "query"],
  },
  execute: async function (args) {
    var action = args.action;
    var query = args.query;
    var limit = args.limit || 5;

    if (action === "search") {
      var url =
        "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
        encodeURIComponent(query) +
        "&srlimit=" +
        Math.min(limit, 10) +
        "&format=json&origin=*";
      var res = await fetch(url);
      if (!res.ok) throw new Error("Wikipedia search failed: " + res.status);
      var data = await res.json();
      var results = (data.query && data.query.search) || [];
      if (results.length === 0)
        return 'No Wikipedia results found for "' + query + '".';
      var lines = results.map(function (r, i) {
        var snippet = (r.snippet || "").replace(/<\/?[^>]+>/g, "");
        return i + 1 + ". " + r.title + " \u2014 " + snippet;
      });
      return (
        'Search results for "' +
        query +
        '":\n' +
        lines.join("\n") +
        "\n\nUse summary with the exact title from the list to get full article content."
      );
    }

    if (action === "summary") {
      var summaryUrl =
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
        encodeURIComponent(query);
      var summaryRes = await fetch(summaryUrl);
      if (summaryRes.status === 404) {
        var fallbackUrl =
          "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
          encodeURIComponent(query) +
          "&srlimit=1&format=json&origin=*";
        var fbRes = await fetch(fallbackUrl);
        if (fbRes.ok) {
          var fbData = await fbRes.json();
          var fbResults = (fbData.query && fbData.query.search) || [];
          if (fbResults.length > 0) {
            var correctTitle = fbResults[0].title;
            var retryUrl =
              "https://en.wikipedia.org/api/rest_v1/page/summary/" +
              encodeURIComponent(correctTitle);
            var retryRes = await fetch(retryUrl);
            if (retryRes.ok) {
              var retryData = await retryRes.json();
              var retryExtract = retryData.extract || "No extract available.";
              if (retryExtract.length > 3000)
                retryExtract = retryExtract.slice(0, 3000) + "...";
              return (
                'Found page "' +
                correctTitle +
                '" instead:\n\n' +
                retryExtract
              );
            }
          }
        }
        return (
          'Page "' +
          query +
          '" not found on Wikipedia. Try using search first to find the exact page title.'
        );
      }
      if (!summaryRes.ok)
        throw new Error("Wikipedia summary failed: " + summaryRes.status);
      var summaryData = await summaryRes.json();
      var extract = summaryData.extract || "No extract available.";
      if (
        summaryData.title &&
        summaryData.title.toLowerCase() !== query.toLowerCase()
      ) {
        extract = "Page: " + summaryData.title + "\n\n" + extract;
      }
      if (extract.length > 3000) extract = extract.slice(0, 3000) + "...";
      return extract;
    }

    throw new Error("Unknown action: " + action);
  },
});
