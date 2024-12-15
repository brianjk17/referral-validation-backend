const express = require("express");
const { supabase } = require("./supabase"); // Import supabase instance
const serverless = require("serverless-http");
const app = express();
// const port = 3000;
require("dotenv").config();

app.get("/", (req, res) => {
  res.send("safu extension referrals");
});

app.get("/validate/:code", async (req, res) => {
  const { code } = req.params;

  try {
    const { data, error } = await supabase
      .from("referrals")
      .select("*")
      .eq("referral_code", code);

    if (error) throw error;

    if (data.length > 0) {
      res.json({ success: true, message: `${code} is valid.`, data });
    } else {
      res.json({ success: false, message: `${code} is not valid.` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// app.listen(port, () => {
//   console.log(`Example app listening on port ${port}`);
// });

module.exports.handler = serverless(app);
