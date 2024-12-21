const express = require("express");
const { supabase } = require("./supabase"); // Import supabase instance
const serverless = require("serverless-http");
const app = express();

app.use(express.json());

// const port = 3000;

app.get("/test", (req, res) => {
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
      res.json({ success: true, message: `${code} is valid.` });
    } else {
      res.json({ success: false, message: `${code} is not valid.` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/validating/:code", async (req, res) => {
  const { code } = req.params;

  // Validate referral code format
  if (!/^[a-zA-Z0-9]+$/.test(code)) {
    return res.status(400).json({ error: "Invalid referral code format." });
  }

  try {
    const { data, error } = await supabase
      .from("referrals")
      .select("id, referral_code")
      .eq("referral_code", code)
      .limit(1);

    if (error) {
      console.error("Error validating referral code:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (data.length > 0) {
      return res.status(200).json({
        success: true,
        message: `${code} is valid.`,
        data: data[0],
      });
    }

    // Referral code not found
    return res.status(404).json({
      success: false,
      message: `${code} is not valid.`,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Storing wallet in table and setting the Tier
// after connecting wallet, check if wallet connected is in table using the code
// if yes, pass
// else if not, then store wallet with null address
// get the referral code id and store it in used column
// set Tier level of the connected wallet here
app.post("/check-wallet-referral-code", async (req, res) => {
  const { walletAddress, referralCode } = req.body;
  const useReferralCode = referralCode.toLowerCase();
  if (!walletAddress) {
    return res.status(400).json({ error: "Wallet address is required" });
  }

  try {
    // Check if the wallet already exists
    const { data: walletData, error: fetchError } = await supabase
      .from("referrals")
      .select("*")
      .eq("address", walletAddress)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching wallet:", fetchError);
      return res.status(500).json({ error: "Error checking wallet." });
    }

    if (walletData) {
      return res.status(200).json({ message: "Wallet already exists." });
    }

    // Initialize referral variables
    let referralUsedId = null;
    let referralTier = 0;

    // Validate and process referral code if provided
    if (useReferralCode) {
      const { data: referralData, error: referralError } = await supabase
        .from("referrals")
        .select("id, tier")
        .eq("referral_code", useReferralCode)
        .single();

      if (referralError && referralError.code !== "PGRST116") {
        console.error("Error fetching referral:", referralError);
        return res.status(500).json({
          error: "Error checking referral code.",
          message: referralError.message,
        });
      }

      if (!referralData) {
        return res.status(400).json({ error: "Invalid referral code." });
      }

      referralUsedId = referralData.id;
      referralTier = referralData.tier;
    }

    const { data: newWallet, error: insertError } = await supabase
      .from("referrals")
      .insert([
        {
          address: walletAddress,
          referral_code: null,
          tier: Number(referralTier) + 1,
          used_id: referralUsedId,
        },
      ])
      .select();

    if (insertError) {
      console.error("Error inserting wallet:", insertError);
      return res.status(500).json({
        error: "Error adding wallet to the database.",
        message: insertError.message,
      });
    }

    return res.status(201).json({
      message: "Wallet connected and added to the database.",
      wallet: newWallet,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
});

// Create Referral
// add the referral code with the row of the connected wallet
// return error if referral code used
app.post("/set-referral-code", async (req, res) => {
  const { walletAddress, referralCode } = req.body;

  // Validate inputs
  if (!walletAddress) {
    return res.status(400).json({ error: "Wallet address is required." });
  }

  if (!referralCode) {
    return res.status(400).json({ error: "Referral code is required." });
  }

  if (!/^[a-zA-Z0-9]+$/.test(referralCode)) {
    return res.status(400).json({
      error: "Referral code must contain only alphanumeric characters.",
    });
  }

  try {
    const lowerCaseReferralCode = referralCode.toLowerCase();

    // Check if referral code already exists
    const { data: referralCodeData, error: fetchError } = await supabase
      .from("referrals")
      .select("id")
      .eq("referral_code", lowerCaseReferralCode)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error checking referral code:", fetchError);
      return res.status(500).json({ error: "Error checking referral code." });
    }

    if (referralCodeData) {
      return res.status(400).json({
        error: "Referral code already exists. Please use a unique code.",
      });
    }

    // Update referral code for the given wallet address
    const { data, error } = await supabase
      .from("referrals")
      .update({ referral_code: lowerCaseReferralCode })
      .eq("address", walletAddress)
      .select();

    if (error) {
      console.error("Error updating referral code:", error);
      return res.status(500).json({
        error: "Failed to update referral code.",
        message: error.message,
      });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Wallet address not found." });
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: "Referral code updated successfully.",
      updated: data,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//save transaction fees

// app.listen(port, () => {
//   console.log(`Example app listening on port ${port}`);
// });
module.exports.handler = serverless(app);
