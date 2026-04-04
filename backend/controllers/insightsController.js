const { getInsightData } = require("../models/dashboardModel");

async function renderInsightsPage(req, res, next) {
  try {
    const insights = await getInsightData();
    res.render("admin-insights", {
      title: "Insights",
      activeAdminTab: "insights",
      // Pass as JSON strings for Chart.js injection
      hourVolumeJson: JSON.stringify(insights.hourVolume),
      dayVolumeJson: JSON.stringify(insights.dayVolume),
      bucketWaitJson: JSON.stringify(insights.bucketWait),
      turnover: insights.turnover,
      summary: insights.summary
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { renderInsightsPage };
