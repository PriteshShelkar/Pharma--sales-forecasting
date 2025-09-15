const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const csvParser = require('csv-parser');
const FormData = require("form-data");
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Created uploads directory');
}

// MongoDB connection
// const connectDB = async () => {
//   try {
//     await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pharma_sales');
//     console.log('✅ Connected to MongoDB successfully');
//   } catch (error) {
//     console.error('❌ MongoDB connection error:', error.message);
//     process.exit(1);
//   }
// };

// connectDB();

// Updated Sales Data Schema for your CSV structure
// Updated Sales Data Schema with better validation
const salesSchema = new mongoose.Schema({
  datum: {
    type: Date,
    required: true,
    index: true // Add index for better query performance
  },
  M01AB: { type: Number, default: 0, min: 0 },
  M01AE: { type: Number, default: 0, min: 0 },
  N02BA: { type: Number, default: 0, min: 0 },
  N02BE: { type: Number, default: 0, min: 0 },
  N05B: { type: Number, default: 0, min: 0 },
  N05C: { type: Number, default: 0, min: 0 },
  R03: { type: Number, default: 0, min: 0 },
  R06: { type: Number, default: 0, min: 0 },
  year: { type: Number, required: true, min: 2000, max: 2030 },
  month: { type: Number, required: true, min: 1, max: 12 },
  hour: { type: Number, default: 0, min: 0 },
  weekdayName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, {
  // Add options for better performance and debugging
  timestamps: true,
  collection: 'salesdatas'
});

// Add compound index for better querying
salesSchema.index({ year: 1, month: 1 });
salesSchema.index({ datum: 1, createdAt: 1 });

const SalesData = mongoose.model('SalesData', salesSchema);


// const SalesData = mongoose.model('SalesData', salesSchema);

// Enhanced Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.csv';
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed!'), false);
    }
  }
});

// Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// FIXED: Dashboard endpoint with proper growth rate calculation
// ENHANCED: Dashboard endpoint with dynamic average sales calculation
// app.get('/api/dashboard', async (req, res) => {
//   try {
//     console.log('📊 Dashboard request received');

//     // Test database connection
//     const totalRecords = await SalesData.countDocuments();
//     console.log(`📊 Total records in database: ${totalRecords}`);

//     if (totalRecords === 0) {
//       return res.json({
//         salesData: [],
//         kpis: {
//           totalSales: 0,
//           growthRate: 0,
//           topDrug: 'No data',
//           averageDailySales: 0,
//           dataGranularity: 'unknown',
//           averageLabel: 'Average Daily Sales'
//         },
//         drugCategories: ['M01AB', 'M01AE', 'N02BA', 'N02BE', 'N05B', 'N05C', 'R03', 'R06']
//       });
//     }

//     // Get recent sales data for analysis
//     const salesData = await SalesData.find()
//       .sort({ datum: 1 })
//       .limit(200) // Increased for better granularity detection
//       .lean();

//     console.log(`📊 Found ${salesData.length} sales records`);

//     // NEW: Enhanced average sales calculation with granularity detection
//     const calculateAverageSales = (salesData) => {
//       // Calculate total sales sum across all records and drugs
//       const totalSalesSum = salesData.reduce((sum, item) => {
//         return sum + ['M01AB', 'M01AE', 'N02BA', 'N02BE', 'N05B', 'N05C', 'R03', 'R06']
//           .reduce((drugSum, drug) => drugSum + (parseFloat(item[drug]) || 0), 0);
//       }, 0);

//       // Basic average per record
//       const averagePerRecord = salesData.length > 0 ? totalSalesSum / salesData.length : 0;

//       // NEW: Detect data granularity based on date patterns
//       const detectGranularity = (salesData) => {
//         if (salesData.length < 2) return 'unknown';

//         const dates = salesData.slice(0, 10).map(item => new Date(item.datum));
//         const timeDiffs = [];

//         for (let i = 1; i < dates.length; i++) {
//           const diff = Math.abs(dates[i] - dates[i - 1]) / (1000 * 60 * 60); // Hours
//           if (diff > 0) timeDiffs.push(diff);
//         }

//         if (timeDiffs.length === 0) return 'unknown';

//         const avgDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;

//         console.log(`📅 Average time difference between records: ${avgDiff} hours`);

//         // Determine granularity based on average time difference
//         if (avgDiff <= 2) return 'hourly';           // ≤ 2 hours
//         else if (avgDiff <= 36) return 'daily';      // ≤ 36 hours (allowing for gaps)
//         else if (avgDiff <= 200) return 'weekly';    // ≤ 200 hours (~8 days)
//         else return 'monthly';                       // > 200 hours
//       };

//       const granularity = detectGranularity(salesData);
//       console.log(`📊 Detected data granularity: ${granularity}`);

//       // Convert to standardized daily equivalent
//       const conversionMultipliers = {
//         'hourly': 24,    // 24 hours per day
//         'daily': 1,      // Already daily
//         'weekly': 1 / 7,   // Divide by 7 days
//         'monthly': 1 / 30, // Divide by ~30 days
//         'unknown': 1     // Default to no conversion
//       };

//       const dailyEquivalent = averagePerRecord * (conversionMultipliers[granularity] || 1);

//       // Generate appropriate labels
//       const labelMap = {
//         'hourly': 'Average Hourly Sales',
//         'daily': 'Average Daily Sales',
//         'weekly': 'Average Weekly Sales',
//         'monthly': 'Average Monthly Sales',
//         'unknown': 'Average Sales per Record'
//       };

//       return {
//         averagePerRecord: Math.round(averagePerRecord * 100) / 100,
//         dailyEquivalent: Math.round(dailyEquivalent * 100) / 100,
//         granularity: granularity,
//         label: labelMap[granularity] || 'Average Sales',
//         totalSalesSum: Math.round(totalSalesSum * 100) / 100
//       };
//     };

//     // Calculate enhanced average sales
//     const avgSalesData = calculateAverageSales(salesData);
//     console.log('📊 Average sales calculation:', avgSalesData);

//     // ENHANCED: Monthly growth rate calculation using aggregation
//     const monthlyGrowthPipeline = [
//       {
//         $group: {
//           _id: {
//             year: { $year: "$datum" },
//             month: { $month: "$datum" }
//           },
//           totalSales: {
//             $sum: {
//               $add: ["$M01AB", "$M01AE", "$N02BA", "$N02BE", "$N05B", "$N05C", "$R03", "$R06"]
//             }
//           },
//           count: { $sum: 1 }
//         }
//       },
//       {
//         $sort: { "_id.year": 1, "_id.month": 1 }
//       },
//       {
//         $group: {
//           _id: null,
//           months: {
//             $push: {
//               year: "$_id.year",
//               month: "$_id.month",
//               totalSales: "$totalSales",
//               count: "$count"
//             }
//           }
//         }
//       }
//     ];

//     console.log('📈 Calculating monthly growth rate...');
//     const monthlyResults = await SalesData.aggregate(monthlyGrowthPipeline);

//     let growthRate = 0;

//     if (monthlyResults.length > 0 && monthlyResults[0].months.length >= 2) {
//       const months = monthlyResults[0].months;
//       const currentMonth = months[months.length - 1];
//       const previousMonth = months[months.length - 2];

//       console.log('📊 Monthly comparison:', {
//         current: currentMonth,
//         previous: previousMonth
//       });

//       if (previousMonth.totalSales > 0) {
//         growthRate = ((currentMonth.totalSales - previousMonth.totalSales) / previousMonth.totalSales) * 100;
//         growthRate = Math.round(growthRate * 100) / 100;
//       }

//       console.log(`✅ Calculated growth rate: ${growthRate}%`);
//     } else {
//       console.log('⚠️ Insufficient data for growth calculation');
//     }

//     // Calculate drug totals and find top performer
//     const drugTotals = { M01AB: 0, M01AE: 0, N02BA: 0, N02BE: 0, N05B: 0, N05C: 0, R03: 0, R06: 0 };

//     salesData.forEach(item => {
//       Object.keys(drugTotals).forEach(drug => {
//         const value = parseFloat(item[drug]) || 0;
//         drugTotals[drug] += value;
//       });
//     });

//     // Find top drug
//     const topDrugEntry = Object.entries(drugTotals).sort(([, a], [, b]) => b - a)[0];
//     const topDrug = topDrugEntry ? topDrugEntry[0] : 'N/A';

//     // ENHANCED KPIs with dynamic labeling
//     const kpis = {
//       totalSales: avgSalesData.totalSalesSum,
//       growthRate: growthRate,
//       topDrug: topDrug,
//       averageDailySales: avgSalesData.dailyEquivalent, // Always shows daily equivalent
//       averagePerRecord: avgSalesData.averagePerRecord, // Shows per-record average
//       dataGranularity: avgSalesData.granularity,
//       averageLabel: avgSalesData.label, // Dynamic label based on granularity
//       recordCount: salesData.length
//     };

//     // Format sales data for frontend
//     const formattedSalesData = salesData.map(item => {
//       const total = Object.keys(drugTotals).reduce((sum, drug) =>
//         sum + (parseFloat(item[drug]) || 0), 0);

//       return {
//         date: item.datum.toISOString().split('T')[0],
//         M01AB: parseFloat(item.M01AB) || 0,
//         M01AE: parseFloat(item.M01AE) || 0,
//         N02BA: parseFloat(item.N02BA) || 0,
//         N02BE: parseFloat(item.N02BE) || 0,
//         N05B: parseFloat(item.N05B) || 0,
//         N05C: parseFloat(item.N05C) || 0,
//         R03: parseFloat(item.R03) || 0,
//         R06: parseFloat(item.R06) || 0,
//         total: parseFloat(total.toFixed(2))
//       };
//     });

//     console.log('✅ Enhanced dashboard data processed successfully');
//     console.log('📈 Final Enhanced KPIs:', kpis);

//     res.json({
//       salesData: formattedSalesData,
//       kpis,
//       drugCategories: ['M01AB', 'M01AE', 'N02BA', 'N02BE', 'N05B', 'N05C', 'R03', 'R06']
//     });

//   } catch (error) {
//     console.error('🔥 Enhanced dashboard endpoint error:', error);
//     res.status(500).json({
//       error: 'Dashboard data fetch failed: ' + error.message
//     });
//   }
// });



// app.get("/api/dashboard", async (req, res) => {
//   try {
//     const filename = req.query.filename; // frontend must send uploaded filename
//     if (!filename) {
//       return res.status(400).json({ error: "Filename required" });
//     }

//     const filePath = path.join(__dirname, "uploads", filename);
//     if (!fs.existsSync(filePath)) {
//       return res.status(404).json({ error: "CSV file not found" });
//     }

//     const results = [];
//     fs.createReadStream(filePath)
//       .pipe(csvParser())
//       .on("data", (data) => {
//         results.push({
//           date: data.datum,
//           M01AB: parseFloat(data.M01AB) || 0,
//           M01AE: parseFloat(data.M01AE) || 0,
//           N02BA: parseFloat(data.N02BA) || 0,
//           N02BE: parseFloat(data.N02BE) || 0,
//           N05B: parseFloat(data.N05B) || 0,
//           N05C: parseFloat(data.N05C) || 0,
//           R03: parseFloat(data.R03) || 0,
//           R06: parseFloat(data.R06) || 0
//         });
//       })
//       .on("end", () => {
//         if (results.length === 0) {
//           return res.status(400).json({ error: "CSV is empty or invalid" });
//         }

//         // KPIs
//         const totalSales = results.reduce((sum, row) => {
//           return sum + Object.keys(row)
//             .filter(k => k !== "date")
//             .reduce((s, k) => s + row[k], 0);
//         }, 0);

//         const avgDailySales = totalSales / results.length;

//         // Top drug
//         const drugTotals = {};
//         ["M01AB", "M01AE", "N02BA", "N02BE", "N05B", "N05C", "R03", "R06"].forEach(drug => {
//           drugTotals[drug] = results.reduce((s, row) => s + row[drug], 0);
//         });
//         const topDrug = Object.entries(drugTotals).sort((a, b) => b[1] - a[1])[0][0];

//         res.json({
//           salesData: results,
//           kpis: {
//             totalSales,
//             averageDailySales: Math.round(avgDailySales * 100) / 100,
//             topDrug
//           },
//           drugCategories: Object.keys(drugTotals)
//         });
//       })
//       .on("error", (err) => {
//         console.error("❌ CSV parse error:", err);
//         res.status(500).json({ error: "Failed to parse CSV: " + err.message });
//       });

//   } catch (err) {
//     console.error("❌ Dashboard error:", err);
//     res.status(500).json({ error: "Dashboard failed: " + err.message });
//   }
// });



// app.get("/api/dashboard", async (req, res) => {
//   try {
//     const filename = req.query.filename; // frontend must send uploaded filename
//     if (!filename) return res.status(400).json({ error: "Filename required" });

//     const filePath = path.join(__dirname, "uploads", filename);
//     if (!fs.existsSync(filePath)) return res.status(404).json({ error: "CSV file not found" });

//     const results = [];
//     fs.createReadStream(filePath)
//       .pipe(csvParser())
//       .on("data", (data) => {
//         results.push({
//           date: data.datum,
//           M01AB: parseFloat(data.M01AB) || 0,
//           M01AE: parseFloat(data.M01AE) || 0,
//           N02BA: parseFloat(data.N02BA) || 0,
//           N02BE: parseFloat(data.N02BE) || 0,
//           N05B: parseFloat(data.N05B) || 0,
//           N05C: parseFloat(data.N05C) || 0,
//           R03: parseFloat(data.R03) || 0,
//           R06: parseFloat(data.R06) || 0
//         });
//       })
//       .on("end", () => {
//         if (results.length === 0) return res.status(400).json({ error: "CSV is empty or invalid" });

//         const drugs = ["M01AB","M01AE","N02BA","N02BE","N05B","N05C","R03","R06"];

//         // --- Total Sales & Top Drug ---
//         const drugTotals = {};
//         drugs.forEach(d => drugTotals[d] = results.reduce((s,r) => s + r[d], 0));
//         const totalSales = Object.values(drugTotals).reduce((a,b)=>a+b,0);
//         const topDrug = Object.entries(drugTotals).sort((a,b)=>b[1]-a[1])[0][0];

//         // --- Average per Record & Granularity ---
//         const averagePerRecord = totalSales / results.length;

//         const dates = results.map(r => new Date(r.date));
//         const timeDiffs = dates.slice(1).map((d,i) => (d - dates[i])/(1000*60*60)); // hours
//         const avgDiff = timeDiffs.length ? timeDiffs.reduce((a,b)=>a+b,0)/timeDiffs.length : 0;

//         let granularity = 'unknown';
//         if(avgDiff <= 2) granularity='hourly';
//         else if(avgDiff <=36) granularity='daily';
//         else if(avgDiff <=200) granularity='weekly';
//         else granularity='monthly';

//         const conversionMultipliers = { hourly:24, daily:1, weekly:1/7, monthly:1/30, unknown:1 };
//         const dailyEquivalent = averagePerRecord * conversionMultipliers[granularity];

//         const labelMap = {
//           hourly: 'Average Hourly Sales',
//           daily: 'Average Daily Sales',
//           weekly: 'Average Weekly Sales',
//           monthly: 'Average Monthly Sales',
//           unknown: 'Average Sales per Record'
//         };

//         // --- Growth Rate (month over month) ---
//         let growthRate = 0;
//         const monthlyTotals = {};
//         results.forEach(r => {
//           const d = new Date(r.date);
//           const key = `${d.getFullYear()}-${d.getMonth()+1}`;
//           if(!monthlyTotals[key]) monthlyTotals[key]=0;
//           monthlyTotals[key] += drugs.reduce((s,drug)=>s+r[drug],0);
//         });

//         const months = Object.keys(monthlyTotals).sort();
//         if(months.length >=2){
//           const prev = monthlyTotals[months[months.length-2]];
//           const curr = monthlyTotals[months[months.length-1]];
//           if(prev>0) growthRate = Math.round(((curr-prev)/prev)*100*100)/100;
//         }

//         // --- Format sales data with row-wise total ---
//         const formattedSalesData = results.map(r => {
//           const total = drugs.reduce((s,d)=>s+r[d],0);
//           return { date: r.date, ...r, total: Math.round(total*100)/100 };
//         });

//         // --- Final KPIs ---
//         const kpis = {
//           totalSales: Math.round(totalSales*100)/100,
//           topDrug,
//           growthRate,
//           averagePerRecord: Math.round(averagePerRecord*100)/100,
//           averageDailySales: Math.round(dailyEquivalent*100)/100,
//           dataGranularity: granularity,
//           averageLabel: labelMap[granularity],
//           recordCount: results.length
//         };

//         res.json({
//           salesData: formattedSalesData,
//           kpis,
//           drugCategories: drugs
//         });
//       })
//       .on("error", (err) => {
//         console.error("❌ CSV parse error:", err);
//         res.status(500).json({ error: "Failed to parse CSV: " + err.message });
//       });

//   } catch (err) {
//     console.error("❌ Dashboard error:", err);
//     res.status(500).json({ error: "Dashboard failed: " + err.message });
//   }
// });

// module.exports = app;

app.get("/api/dashboard", async (req, res) => {
  try {
    const filename = req.query.filename;
    if (!filename) return res.status(400).json({ error: "Filename required" });

    const filePath = path.join(__dirname, "uploads", filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "CSV file not found" });

    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (data) => {
        results.push({
          date: data.datum,
          M01AB: parseFloat(data.M01AB) || 0,
          M01AE: parseFloat(data.M01AE) || 0,
          N02BA: parseFloat(data.N02BA) || 0,
          N02BE: parseFloat(data.N02BE) || 0,
          N05B: parseFloat(data.N05B) || 0,
          N05C: parseFloat(data.N05C) || 0,
          R03: parseFloat(data.R03) || 0,
          R06: parseFloat(data.R06) || 0
        });
      })
      .on("end", () => {
        if (results.length === 0) return res.status(400).json({ error: "CSV is empty or invalid" });

        // ----- Calculate total & per-record averages -----
        const totalSalesSum = results.reduce((sum, row) => {
          return sum + ['M01AB','M01AE','N02BA','N02BE','N05B','N05C','R03','R06']
            .reduce((s, drug) => s + row[drug], 0);
        }, 0);

        const averagePerRecord = totalSalesSum / results.length;

        // ----- Detect granularity -----
        const detectGranularity = (data) => {
          if (data.length < 2) return 'unknown';
          const dates = data.slice(0, 10).map(r => new Date(r.date));
          const diffs = [];
          for (let i=1; i<dates.length; i++){
            const diffH = Math.abs(dates[i]-dates[i-1]) / (1000*60*60);
            if(diffH>0) diffs.push(diffH);
          }
          if(diffs.length===0) return 'unknown';
          const avgDiff = diffs.reduce((a,b)=>a+b,0)/diffs.length;
          if(avgDiff <= 2) return 'hourly';
          else if(avgDiff <= 36) return 'daily';
          else if(avgDiff <= 200) return 'weekly';
          else return 'monthly';
        };

        const granularity = detectGranularity(results);

        const conversionMultipliers = { hourly:24, daily:1, weekly:1/7, monthly:1/30, unknown:1 };
        const dailyEquivalent = averagePerRecord * (conversionMultipliers[granularity] || 1);

        const labelMap = { hourly:'Average Hourly Sales', daily:'Average Daily Sales', weekly:'Average Weekly Sales', monthly:'Average Monthly Sales', unknown:'Average Sales per Record'};

        // ----- Dynamic growth calculation -----
        const aggregateByGranularity = (data, granularity) => {
          const totals = {};
          data.forEach(row => {
            const d = new Date(row.date);
            let key = '';
            switch(granularity){
              case 'hourly': key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}-${d.getHours()}`; break;
              case 'daily': key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; break;
              case 'weekly': 
                const oneJan = new Date(d.getFullYear(),0,1);
                const week = Math.ceil((((d-oneJan)/86400000)+oneJan.getDay()+1)/7);
                key = `${d.getFullYear()}-W${week}`;
                break;
              case 'monthly': key = `${d.getFullYear()}-${d.getMonth()+1}`; break;
              default: key = row.date;
            }
            if(!totals[key]) totals[key]=0;
            totals[key] += ['M01AB','M01AE','N02BA','N02BE','N05B','N05C','R03','R06']
              .reduce((s, drug) => s + row[drug],0);
          });
          return totals;
        };

        const totalsPerInterval = aggregateByGranularity(results, granularity);
        // const sortedKeys = Object.keys(totalsPerInterval).sort();
        const sortedKeys = Object.keys(totalsPerInterval).sort((a, b) => {
  // Convert monthly keys to dates for proper sorting
                const dateA = new Date(a + '-01'); // '2019-9' becomes '2019-9-01'
                const dateB = new Date(b + '-01'); // '2019-10' becomes '2019-10-01'
                return dateA - dateB;
              });
        let growthRate = 0;
        if(sortedKeys.length >= 2){
          const prev = totalsPerInterval[sortedKeys[sortedKeys.length-2]];
          const curr = totalsPerInterval[sortedKeys[sortedKeys.length-1]];
          if(prev>0) growthRate = ((curr-prev)/prev)*100;
          growthRate = Math.round(growthRate*100)/100;
        }

        // ----- Drug totals & top performer -----
        const drugTotals = { M01AB:0,M01AE:0,N02BA:0,N02BE:0,N05B:0,N05C:0,R03:0,R06:0 };
        results.forEach(row => {
          Object.keys(drugTotals).forEach(drug => { drugTotals[drug] += row[drug]; });
        });
        const topDrugEntry = Object.entries(drugTotals).sort(([,a],[,b])=>b-a)[0];
        const topDrug = topDrugEntry ? topDrugEntry[0] : 'N/A';

        // ----- Prepare final KPIs -----
        const kpis = {
          totalSales: Math.round(totalSalesSum*100)/100,
          growthRate,
          topDrug,
          averageDailySales: Math.round(dailyEquivalent*100)/100,
          averagePerRecord: Math.round(averagePerRecord*100)/100,
          dataGranularity: granularity,
          averageLabel: labelMap[granularity] || 'Average Sales',
          recordCount: results.length
        };

        const formattedSalesData = results.map(row => {
          const total = Object.keys(drugTotals).reduce((s, drug) => s+row[drug],0);
          return { ...row, total: Math.round(total*100)/100 };
        });

        res.json({
          salesData: formattedSalesData,
          kpis,
          drugCategories: Object.keys(drugTotals)
        });
      })
      .on("error", err => {
        console.error("❌ CSV parse error:", err);
        res.status(500).json({ error: "Failed to parse CSV: "+err.message });
      });
  } catch (err) {
    console.error("❌ Dashboard error:", err);
    res.status(500).json({ error: "Dashboard failed: "+err.message });
  }
});

module.exports = app;

// Enhanced upload endpoint for your CSV structure
// FIXED: Enhanced upload endpoint with detailed logging
// app.post('/api/upload', (req, res) => {
//   console.log('📤 Upload request received');

//   upload.single('salesData')(req, res, function(err) {
//     if (err) {
//       console.error('❌ Multer error:', err.message);
//       return res.status(400).json({ 
//         error: `Upload failed: ${err.message}` 
//       });
//     }

//     if (!req.file) {
//       console.error('❌ No file received');
//       return res.status(400).json({ 
//         error: 'No file uploaded. Please select a CSV file.' 
//       });
//     }

//     console.log('✅ File received:', req.file.filename);
//     console.log('📁 File path:', req.file.path);
//     console.log('📊 File size:', req.file.size, 'bytes');

//     const filePath = req.file.path;
//     const results = [];
//     const errors = [];

//     try {
//       fs.createReadStream(filePath)
//         .pipe(csv())
//         .on('data', (data) => {
//           try {
//             console.log('📄 Processing row:', Object.keys(data));

//             // Validate required fields
//             if (!data.datum) {
//               errors.push('Missing datum field');
//               return;
//             }

//             const parsedDate = new Date(data.datum);
//             if (isNaN(parsedDate.getTime())) {
//               errors.push(`Invalid date format: ${data.datum}`);
//               return;
//             }

//             const salesRecord = {
//               datum: parsedDate,
//               M01AB: parseFloat(data.M01AB) || 0,
//               M01AE: parseFloat(data.M01AE) || 0,
//               N02BA: parseFloat(data.N02BA) || 0,
//               N02BE: parseFloat(data.N02BE) || 0,
//               N05B: parseFloat(data.N05B) || 0,
//               N05C: parseFloat(data.N05C) || 0,
//               R03: parseFloat(data.R03) || 0,
//               R06: parseFloat(data.R06) || 0,
//               year: parseInt(data.Year) || parsedDate.getFullYear(),
//               month: parseInt(data.Month) || (parsedDate.getMonth() + 1),
//               hour: parseInt(data.Hour) || 0,
//               weekdayName: data['Weekday Name'] || data.weekdayName || 'Unknown'
//             };

//             results.push(salesRecord);
//             console.log(`📊 Processed record ${results.length}:`, {
//               date: salesRecord.datum.toISOString().split('T'),
//               total: salesRecord.M01AB + salesRecord.M01AE + salesRecord.N02BA + salesRecord.N02BE
//             });

//           } catch (rowError) {
//             console.error('❌ Row processing error:', rowError);
//             errors.push(`Row parsing error: ${rowError.message}`);
//           }
//         })
//         .on('end', async () => {
//           console.log(`📊 CSV parsing complete. Processed ${results.length} records`);

//           try {
//             if (results.length === 0) {
//               fs.unlinkSync(filePath);
//               return res.status(400).json({ 
//                 error: 'No valid data found in CSV file',
//                 errors: errors.slice(0, 10)
//               });
//             }

//             console.log('💾 Starting database insertion...');
//             console.log('🔗 Database connection state:', mongoose.connection.readyState);
//             console.log('📊 Sample record to insert:', results);

//             // CRITICAL: Use insertMany with proper error handling
//             const insertResult = await SalesData.insertMany(results, { 
//               ordered: false, // Continue even if some records fail
//               lean: true
//             });

//             console.log('✅ Database insertion successful!');
//             console.log('📊 Insertion result:', {
//               insertedCount: insertResult.length,
//               sampleInserted: insertResult[0] ? insertResult._id : 'none'
//             });

//             // Verify insertion by counting
//             const totalCount = await SalesData.countDocuments();
//             console.log('📊 Total records in database after insertion:', totalCount);

//             // Clean up uploaded file
//             fs.unlinkSync(filePath);
//             console.log('🗑️ Temporary file cleaned up');

//             res.json({
//               recordsProcessed: results.length,
//               recordsInserted: insertResult.length,
//               totalInDatabase: totalCount,
//               errors: errors.slice(0, 10),
//               drugCategories: ['M01AB', 'M01AE', 'N02BA', 'N02BE', 'N05B', 'N05C', 'R03', 'R06'],
//               success: true
//             });

//           } catch (dbError) {
//             console.error('🔥 CRITICAL DATABASE ERROR:', dbError);
//             console.error('Error name:', dbError.name);
//             console.error('Error message:', dbError.message);
//             console.error('Error stack:', dbError.stack);

//             if (fs.existsSync(filePath)) {
//               fs.unlinkSync(filePath);
//             }

//             res.status(500).json({ 
//               error: 'Database insertion failed',
//               message: dbError.message,
//               errorType: dbError.name,
//               recordsProcessed: results.length,
//               success: false
//             });
//           }
//         })
//         .on('error', (csvError) => {
//           console.error('❌ CSV parsing error:', csvError);

//           if (fs.existsSync(filePath)) {
//             fs.unlinkSync(filePath);
//           }

//           res.status(400).json({ 
//             error: 'CSV parsing failed: ' + csvError.message,
//             success: false
//           });
//         });

//     } catch (fileError) {
//       console.error('❌ File processing error:', fileError);

//       if (fs.existsSync(filePath)) {
//         fs.unlinkSync(filePath);
//       }

//       res.status(500).json({ 
//         error: 'File processing failed: ' + fileError.message,
//         success: false
//       });
//     }
//   });
// });


// new simple upload without mongodb only with multer local storage
app.post("/api/upload", upload.single("salesData"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("✅ File received:", req.file.filename);

    // ⚠️ Don’t delete file, keep it in /uploads for forecasting
    // (Optionally save filename to Mongo if you need history per user)

    res.json({
      message: "File uploaded successfully",
      filename: req.file.filename,  // send filename back to frontend
      success: true
    });

  } catch (err) {
    console.error("❌ Upload error:", err.message);
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});



// app.post('/api/forecast', async (req, res) => {
//   console.log('🔮 Forecast request received:', req.body);

//   try {
//     const { drugCategory, forecastPeriod, seasonality } = req.body;
//     console.log('📊 Parsed request data:', { drugCategory, forecastPeriod, seasonality });

//     // Validation
//     if (!drugCategory || !forecastPeriod) {
//       console.error('❌ Missing required fields');
//       return res.status(400).json({ error: 'Drug category and forecast period are required' });
//     }

//     const validDrugCategories = ['M01AB', 'M01AE', 'N02BA', 'N02BE', 'N05B', 'N05C', 'R03', 'R06'];
//     if (!validDrugCategories.includes(drugCategory)) {
//       console.error('❌ Invalid drug category:', drugCategory);
//       return res.status(400).json({ error: `Invalid drug category: ${drugCategory}` });
//     }

//     console.log('✅ Validation passed, fetching historical data...');

//     // Test database connection first
//     const testQuery = await SalesData.countDocuments();
//     console.log('📊 Total records in database:', testQuery);

//     if (testQuery === 0) {
//       console.error('❌ No data in database');
//       return res.status(400).json({ error: 'No sales data found. Please upload data first.' });
//     }

//     // Fetch historical data with error handling
//     let historicalData;
//     try {
//       historicalData = await SalesData.find({})
//         .sort({ datum: 1 })
//         .limit(1000)
//         .select(`datum ${drugCategory}`);

//       console.log(`📈 Found ${historicalData.length} historical records`);

//     } catch (dbError) {
//       console.error('❌ Database query error:', dbError);
//       return res.status(500).json({ error: 'Database query failed: ' + dbError.message });
//     }

//     if (historicalData.length < 5) {
//       console.error('❌ Insufficient data:', historicalData.length);
//       return res.status(400).json({ 
//         error: `Insufficient historical data. Found ${historicalData.length} records, need at least 5.` 
//       });
//     }

//     // Process drug data safely
//     const drugData = [];
//     let validCount = 0;

//     for (const item of historicalData) {
//       try {
//         const value = item[drugCategory];
//         if (typeof value === 'number' && !isNaN(value)) {
//           drugData.push({
//             date: item.datum.toISOString().split('T')[0],
//             sales: value
//           });
//           if (value > 0) validCount++;
//         }
//       } catch (itemError) {
//         console.error('⚠️ Error processing item:', itemError, item);
//         continue;
//       }
//     }

//     console.log(`📊 Processed ${drugData.length} data points, ${validCount} with sales > 0`);

//     if (drugData.length < 3) {
//       console.error('❌ Insufficient processed data');
//       return res.status(400).json({ 
//         error: `Unable to process data for ${drugCategory}. Only ${drugData.length} valid data points found.` 
//       });
//     }

//     // Generate safe forecast
//     const recentData = drugData.slice(-Math.min(30, drugData.length));
//     const avgValue = recentData.reduce((sum, item) => sum + item.sales, 0) / recentData.length;

//     console.log('📈 Generating forecast with average value:', avgValue);

//     const forecast = {
//       historical: {
//         dates: recentData.map(item => item.date),
//         values: recentData.map(item => item.sales)
//       },
//       forecast: {
//         dates: [],
//         values: []
//       },
//       metrics: {
//         mae: Math.round((Math.random() * 2 + 1) * 100) / 100,
//         rmse: Math.round((Math.random() * 3 + 1.5) * 100) / 100,
//         mape: Math.round((Math.random() * 10 + 5) * 100) / 100
//       }
//     };

//     // Generate forecast safely
//     const lastDate = new Date(drugData[drugData.length - 1].date);
//     const numPeriods = Math.min(parseInt(forecastPeriod), 24);

//     for (let i = 1; i <= numPeriods; i++) {
//       const forecastDate = new Date(lastDate);
//       forecastDate.setMonth(forecastDate.getMonth() + i);
//       forecast.forecast.dates.push(forecastDate.toISOString().split('T')[0]);

//       let baseValue = avgValue * (1 + (Math.random() - 0.5) * 0.2);
//       if (seasonality) {
//         baseValue += Math.sin(i * Math.PI / 6) * avgValue * 0.1;
//       }

//       forecast.forecast.values.push(Math.max(0, Math.round(baseValue * 100) / 100));
//     }

//     console.log('✅ Forecast generated successfully');
//     res.json(forecast);

//   } catch (error) {
//     console.error('🔥 CRITICAL ERROR in forecast endpoint:');
//     console.error('Error name:', error.name);
//     console.error('Error message:', error.message);
//     console.error('Error stack:', error.stack);

//     res.status(500).json({ 
//       error: 'Internal server error during forecasting',
//       message: error.message,
//       type: error.name
//     });
//   }
// });


// main forecast api with flask forward without mongodb only with multer local storage

// maked changes 
app.post("/api/forecast", async (req, res) => {
  try {
    const filename = req.body.filename;
    const category = req.body.category || req.body.drugCategory;
    const days = req.body.days || req.body.forecastPeriod;

    if (!filename) {
      return res.status(400).json({
        error: "CSV filename is required. Please upload a file first."
      });
    }

    const filePath = path.join(__dirname, "uploads", filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "CSV file not found" });
    }

    console.log("📊 Forwarding to Flask with:", {
      filename,
      category,
      days
    });

    // ✅ Proper FormData usage
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), {
      filename: filename,
      contentType: "text/csv"
    });
    if (days) form.append("days", days.toString());
    if (category) form.append("category", category);

    const flaskResponse = await axios.post(
      "http://localhost:7000/predict-csv",
      form,
      {
        headers: {
          ...form.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    res.json(flaskResponse.data);
  } catch (err) {
    console.error("❌ Forecast error:", err.message);
    res.status(500).json({ error: "Forecast failed: " + err.message });
  }
});





// app.get('/api/analytics', async (req, res) => {
//   try {
//     console.log('📈 Analytics request received:', req.query);

//     const { drugCategory, startDate, endDate, timeframe } = req.query;

//     const filter = {};
//     if (startDate && endDate) {
//       filter.datum = {
//         $gte: new Date(startDate),
//         $lte: new Date(endDate)
//       };
//     }

//     let groupBy = {
//       year: { $year: '$datum' },
//       month: { $month: '$datum' }
//     };

//     if (timeframe === 'daily') {
//       groupBy.day = { $dayOfMonth: '$datum' };
//     } else if (timeframe === 'hourly') {
//       groupBy.hour = '$hour';
//     }

//     const pipeline = [
//       { $match: filter }
//     ];

//     if (drugCategory) {
//       pipeline.push({
//         $group: {
//           _id: groupBy,
//           [`${drugCategory}_total`]: { $sum: `$${drugCategory}` },
//           count: { $sum: 1 }
//         }
//       });
//     } else {
//       pipeline.push({
//         $group: {
//           _id: groupBy,
//           M01AB_total: { $sum: '$M01AB' },
//           M01AE_total: { $sum: '$M01AE' },
//           N02BA_total: { $sum: '$N02BA' },
//           N02BE_total: { $sum: '$N02BE' },
//           N05B_total: { $sum: '$N05B' },
//           N05C_total: { $sum: '$N05C' },
//           R03_total: { $sum: '$R03' },
//           R06_total: { $sum: '$R06' },
//           count: { $sum: 1 }
//         }
//       });
//     }

//     pipeline.push({ $sort: { '_id.year': 1, '_id.month': 1 } });

//     const analytics = await SalesData.aggregate(pipeline);

//     console.log('✅ Analytics data generated');
//     res.json(analytics);
//   } catch (error) {
//     console.error('❌ Analytics error:', error);
//     res.status(500).json({ error: 'Analytics failed: ' + error.message });
//   }
// });



app.get('/api/analytics', async (req, res) => {
  try {
    console.log('📈 Analytics request received:', req.query);

    let { filename, drugCategory, startDate, endDate, timeframe } = req.query;

    const uploadsDir = path.join(__dirname, 'uploads');

    // If no filename provided, pick the last uploaded CSV
    if (!filename) {
      const files = fs.readdirSync(uploadsDir)
        .filter(f => f.endsWith('.csv'))
        .map(f => ({ name: f, time: fs.statSync(path.join(uploadsDir, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (files.length === 0) {
        return res.status(404).json({ error: 'No CSV file found in uploads' });
      }
      filename = files[0].name;
      console.log(`📄 Using last uploaded CSV: ${filename}`);
    }

    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'CSV file not found' });
    }

    const results = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', data => {
        const rowDate = new Date(data.datum);
        if (startDate && endDate) {
          const s = new Date(startDate), e = new Date(endDate);
          if (rowDate < s || rowDate > e) return;
        }

        results.push({
          datum: rowDate,
          M01AB: parseFloat(data.M01AB) || 0,
          M01AE: parseFloat(data.M01AE) || 0,
          N02BA: parseFloat(data.N02BA) || 0,
          N02BE: parseFloat(data.N02BE) || 0,
          N05B: parseFloat(data.N05B) || 0,
          N05C: parseFloat(data.N05C) || 0,
          R03: parseFloat(data.R03) || 0,
          R06: parseFloat(data.R06) || 0,
        });
      })
      .on('end', () => {
        if (results.length === 0) return res.status(400).json({ error: 'CSV is empty or no data for date range' });

        const aggregated = {};

        results.forEach(row => {
          let key;
          if (timeframe === 'hourly') {
            key = row.datum.toISOString().slice(0, 13); // YYYY-MM-DDTHH
          } else if (timeframe === 'daily') {
            key = row.datum.toISOString().slice(0, 10); // YYYY-MM-DD
          } else if (timeframe === 'weekly') {
            const firstDayOfWeek = new Date(row.datum);
            firstDayOfWeek.setDate(row.datum.getDate() - row.datum.getDay()); // Sunday as start
            key = firstDayOfWeek.toISOString().slice(0, 10);
          } else { // default monthly
            key = row.datum.toISOString().slice(0, 7); // YYYY-MM
          }

          if (!aggregated[key]) aggregated[key] = {
            count: 0,
            M01AB_total: 0,
            M01AE_total: 0,
            N02BA_total: 0,
            N02BE_total: 0,
            N05B_total: 0,
            N05C_total: 0,
            R03_total: 0,
            R06_total: 0
          };

          Object.keys(aggregated[key]).forEach(k => {
            if (k !== 'count') {
              const originalKey = k.replace('_total','');
              aggregated[key][k] += row[originalKey] || 0;
            }
          });

          aggregated[key].count += 1;
        });

        const formatted = Object.entries(aggregated).map(([key, vals]) => {
          const dateParts = key.split('-'); // YYYY-MM-DD or YYYY-MM
          return {
            _id: {
              year: parseInt(dateParts[0]),
              month: parseInt(dateParts[1]) || 1,
              day: dateParts[2] ? parseInt(dateParts[2]) : undefined,
              hour: dateParts[3] ? parseInt(dateParts[3]) : undefined,
            },
            ...vals
          };
        });

        res.json({ filename, timeframe: timeframe || 'monthly', analytics: formatted });
      })
      .on('error', err => {
        console.error('❌ CSV parse error:', err);
        res.status(500).json({ error: 'Failed to parse CSV: ' + err.message });
      });

  } catch (err) {
    console.error('❌ Analytics error:', err);
    res.status(500).json({ error: 'Analytics failed: ' + err.message });
  }
});



app.get('/api/debug/growth', async (req, res) => {
  try {
    console.log('🔍 Debug: Analyzing growth rate data...');

    const pipeline = [
      {
        $group: {
          _id: {
            year: { $year: "$datum" },
            month: { $month: "$datum" }
          },
          totalSales: {
            $sum: { $add: ["$M01AB", "$M01AE", "$N02BA", "$N02BE", "$N05B", "$N05C", "$R03", "$R06"] }
          },
          recordCount: { $sum: 1 },
          avgSales: { $avg: { $add: ["$M01AB", "$M01AE", "$N02BA", "$N02BE", "$N05B", "$N05C", "$R03", "$R06"] } }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ];

    const results = await SalesData.aggregate(pipeline);

    console.log('📊 Debug results:', results);

    // Calculate growth rates for debugging
    const growthData = results.map((month, index) => {
      if (index === 0) {
        return { ...month, growthRate: 0, note: 'First month - no growth calculation' };
      }

      const previousMonth = results[index - 1];
      const growthRate = previousMonth.totalSales > 0 ?
        ((month.totalSales - previousMonth.totalSales) / previousMonth.totalSales) * 100 : 0;

      return {
        ...month,
        growthRate: Math.round(growthRate * 100) / 100,
        previousMonthSales: previousMonth.totalSales
      };
    });

    res.json({
      monthlyBreakdown: growthData,
      totalMonths: results.length,
      hasGrowthData: results.length >= 2,
      latestGrowthRate: growthData.length > 1 ? growthData[growthData.length - 1].growthRate : 0
    });

  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({
      error: 'Debug failed: ' + error.message,
      stack: error.stack
    });
  }
});
// Global error handler (add this AFTER all routes)
app.use((error, req, res, next) => {
  console.error('🔥 Global error handler caught:', error);
  console.error('Error stack:', error.stack);

  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  });
});


// Enhanced health check to verify database connection
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState;
    const recordCount = await SalesData.countDocuments();

    const statusMap = {
      0: 'Disconnected',
      1: 'Connected',
      2: 'Connecting',
      3: 'Disconnecting'
    };

    res.json({
      status: 'healthy',
      database: {
        status: statusMap[dbStatus] || 'Unknown',
        connected: dbStatus === 1,
        recordCount: recordCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// // Global error handler
// app.use((error, req, res, next) => {
//   console.error('🔥 Global error:', error);

//   if (error instanceof multer.MulterError) {
//     if (error.code === 'LIMIT_FILE_SIZE') {
//       return res.status(400).json({ error: 'File too large! Maximum size is 10MB.' });
//     }
//     return res.status(400).json({ error: `Upload error: ${error.message}` });
//   }

//   res.status(500).json({ error: 'Internal server error: ' + error.message });
// });

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Upload directory: ${uploadDir}`);
  console.log(`🌐 API endpoints:`);
  console.log(`   - GET  /api/health`);
  console.log(`   - GET  /api/dashboard`);
  console.log(`   - POST /api/upload`);
  console.log(`   - POST /api/forecast`);
  console.log(`   - GET  /api/analytics`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  });
});

