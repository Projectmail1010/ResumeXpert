// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');
const format = require('pg-format');
const imap = require('imap-simple');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 5000;
const allowedOrigins = [
  'http://localhost:3000',
  'http://192.168.29.42:3000',
  "http://localhost:5173",
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Set up PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware to check if user is authenticated
const authenticateUser = (req, res, next) => {
  const token = req.cookies.token; // Read token from cookies
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next(); // Proceed to next middleware/route
  } catch (err) {
    return res.status(403).json({ error: 'Unauthorized: Invalid token' });
  }
};

app.use(cookieParser()); // Enable cookie parsing

app.get('/check-auth', authenticateUser, (req, res) => {
  res.json({ message: 'Authenticated', user: req.user });
});

// Create the users table if it does not exist
const createUsersTableQuery = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL,
  company VARCHAR(100) NOT NULL,
  work_email VARCHAR(100) NOT NULL,
  email_app_key VARCHAR(100) DEFAULT NULL
);
`;

pool.query(createUsersTableQuery)
  .then(() => console.log('Users table ready'))
  .catch(err => console.error('Error creating users table:', err));

// Start email listener if users exist
async function checkUsersAndStartListener() {
  const checkQuery = `SELECT * FROM users`;
  const check = await pool.query(checkQuery);
  if (check.rows && check.rows.length > 0) {
    const response = await axios.get('http://localhost:5000/start-email-listener');
    console.log(response.data);
  }
}
checkUsersAndStartListener();


// --- Helper function to verify email credentials ---
async function verifyEmailCredentials(workEmail, emailAppKey) {
  const imapConfig = {
    imap: {
      user: workEmail,
      password: emailAppKey,
      host: process.env.IMAP_HOST,
      port: 993,
      tls: true,
      authTimeout: 5000, 
      tlsOptions: { rejectUnauthorized: false } // <-- Ignore SSL errors
    }
  };
  
  try {
    // Attempt IMAP connection
    const connection = await imap.connect(imapConfig);
    await connection.end(); // Close connection
    console.log("✅ Email and App Key are valid.");
    return { success: true }; // Credentials are correct
  } catch (error) {
    console.error("❌ Invalid email or app key:", error.message);
    return { success: false, error: `Invalid email or app key: ${error.message}` };
  }
}
  
// --- SIGNUP Endpoint ---
app.post('/signup', async (req, res) => {
  const { username, password, company, workEmail, emailAppKey, rememberMe } = req.body;
  
  if (!username || !password || !company || !workEmail) {
    return res.status(400).json({ error: 'Required details are not complete' });
  }
  if (emailAppKey == null || emailAppKey == '') {
    try {
      const insertQuery = `
        INSERT INTO users (username, password, company, work_email)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const result = await pool.query(insertQuery, [username, password, company, workEmail]);
      const user = result.rows[0];
      if (rememberMe) {
        // After validating user credentials during login:
        
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  
        // Set the token in an HTTP-only cookie
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'development', // Use 'true' in production
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        });
      }
      return res.status(201).json({ user: result.rows[0] });
    } catch (error) {
      console.error('Error during signup:', error);
      return res.status(500).json({ error: 'Signup failed. Username might already exist.' });
    }
  }
  const verificationResult = await verifyEmailCredentials(workEmail, emailAppKey);
  if (!verificationResult.success) {
    return res.status(400).json({ error: verificationResult.error });
  }
  try {
    const insertQuery = `
      INSERT INTO users (username, password, company, work_email, email_app_key)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [username, password, company, workEmail, emailAppKey]);
    const user = result.rows[0];
    if (rememberMe) {
      // After validating user credentials during login:
      
      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      // Set the token in an HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'development', // Use 'true' in production
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      });
    }
    const response = await axios.get('http://localhost:5000/start-email-listener');
    
    return res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error during signup:', error);
    return res.status(500).json({ error: 'Signup failed. Username might already exist.' });
  }
});

// --- LOGIN Endpoint ---
app.post('/login', async (req, res) => {
  const { username, password, rememberMe } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  
  try {
    const query = `SELECT * FROM users WHERE username = $1 AND password = $2;`;
    const result = await pool.query(query, [username, password]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const user = result.rows[0];
    if (rememberMe) {
      // After validating user credentials during login:
      
      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      // Set the token in an HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'development', // Use 'true' in production
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      });
    }
    return res.status(200).json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/logout', (req, res) => {
  // Clear the 'token' cookie
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // true in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.json({ message: 'Logged out successfully' });
});

// Delete Account API
app.delete('/deleteAccount', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ message: 'Username is required' });
  }

  // Step 1: Retrieve the user’s company name
  const userQuery = 'SELECT company FROM users WHERE username = $1';
  const userResult = await pool.query(userQuery, [username]);

  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const company = userResult.rows[0].company;
  const tableName = company  // Ensure correct table format

  // Delete the user first
  let deleteResult;
  try {
    const deleteUserQuery = 'DELETE FROM users WHERE username = $1 RETURNING *';
    deleteResult = await pool.query(deleteUserQuery, [username]);
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
  
  if (deleteResult.rowCount === 0) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Drop the company table after deleting the user
  try {
    const dropTableQuery = format(`DROP TABLE IF EXISTS %I CASCADE;`, tableName);
    await pool.query(dropTableQuery);
  } catch (error) {
    console.error('Error deleting table:', error);
    return res.status(500).json({ error: 'Failed to delete company table.' });
  }
  selectedTableName = company + '_selected';
  // Drop the company_selected table after deleting the user
  try {
    const dropTableQuery = format(`DROP TABLE IF EXISTS %I CASCADE;`, selectedTableName);
    await pool.query(dropTableQuery);
  } catch (error) {
    console.error('Error deleting table:', error);
    return res.status(500).json({ error: 'Failed to delete company_selected table.' });
  }
  return res.status(200).json({ message: `Account and all the data deleted successfully` });
});

// --- GET JOBS Endpoint ---
app.get('/getJobs', async (req, res) => {
  const { username } = req.query;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  
  try {
    // Retrieve the user’s company name
    const userQuery = 'SELECT company FROM users WHERE username = $1';
    const userResult = await pool.query(userQuery, [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const company = userResult.rows[0].company;
    const tableName = company;
    
    // Retrieve all jobs from the company table
    const jobsQuery = `SELECT * FROM "${tableName}";`;
    const jobsResult = await pool.query(jobsQuery);
    return res.status(200).json({ jobs: jobsResult.rows });
    
  } catch (error) {
    console.error('Error getting jobs:', error);
    return res.status(500).json({ error: 'Failed to get jobs.' });
  }
});

// Download endpoint: /api/download/:id
app.get('/api/download/:id', async (req, res) => {
  const fileId = req.params.id;
  const username = req.query.username;
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  // Retrieve the user’s company name
  const userQuery = 'SELECT company FROM users WHERE username = $1';
  const userResult = await pool.query(userQuery, [username]);
  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: 'User not found.' });
  }
  const company = userResult.rows[0].company;
  const tableName = format(company + '_selected');
  try {
    const query = format('SELECT file_name, file_data FROM %I WHERE id = $1', tableName);
    const result = await pool.query(query, [fileId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    const fileBuffer = Buffer.from(file.file_data, 'binary');
    if (file.file_name.toLowerCase().endsWith('.pdf')) {
      file_type = 'application/pdf';
    }
    else if (file.file_name.toLowerCase().endsWith('.doc')) {
      file_type = 'application/msword';
    }
    else if (file.file_name.toLowerCase().endsWith('.docx')) {
      file_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Set headers so the browser downloads the file.
    res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
    // Set Content-Type based on the file_type column (or default to binary stream).
    res.setHeader('Content-Type', file_type);
    
    // Send the binary file data.
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// --- GET SELECTED Endpoint ---
app.get('/getSelected', async (req, res) => {
  const { username } = req.query;
  
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  
  try {
    // Retrieve the user’s company name
    const userQuery = 'SELECT company FROM users WHERE username = $1';
    const userResult = await pool.query(userQuery, [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const company = userResult.rows[0].company;
    const tableName = format(company + '_selected');
    
    // Retrieve all selected from the company table
    const selectedQuery = `SELECT * FROM "${tableName}";`;
    const selectedResult = await pool.query(selectedQuery);
    
    return res.status(200).json({ selected: selectedResult.rows });
    
  } catch (error) {
    console.error('Error getting selected:', error);
    return res.status(500).json({ error: 'Failed to get selected.' });
  }
});

// --- ADD JOB Endpoint ---
app.post('/addJob', async (req, res) => {
  const { username, jobTitle, jobDescription } = req.body;
  
  if (!username || !jobTitle || !jobDescription) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  
  try {
    // Retrieve the user’s company name
    const userQuery = 'SELECT company FROM users WHERE username = $1';
    const userResult = await pool.query(userQuery, [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const company = userResult.rows[0].company;
    const tableName = company;
    
    // Create a table for the company if it does not exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id SERIAL PRIMARY KEY,
        job_title VARCHAR(255) UNIQUE NOT NULL,
        job_description TEXT NOT NULL
      );
    `;
    await pool.query(createTableQuery);
    
    // Insert the new job into the company table
    const insertJobQuery = `
      INSERT INTO "${tableName}" (job_title, job_description)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const jobResult = await pool.query(insertJobQuery, [jobTitle, jobDescription]);
    return res.status(201).json({ job: jobResult.rows[0] });
    
  } catch (error) {
    console.error('Error adding job:', error);
    return res.status(500).json({ error: 'Failed to add job.' });
  }
});

// --- REMOVE JOB Endpoint ---
app.post('/removeJob', async (req, res) => {
  const { username, jobTitle } = req.body;
  
  if (!username || !jobTitle) {
    return res.status(400).json({ error: 'Username and job title are required.' });
  }
  
  try {
    // Retrieve the user’s company name
    const userQuery = 'SELECT company FROM users WHERE username = $1';
    const userResult = await pool.query(userQuery, [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const company = userResult.rows[0].company;
    const tableName = company;
    
    // Delete the job with the matching job title
    const deleteJobQuery = `
      DELETE FROM "${tableName}"
      WHERE job_title = $1
      RETURNING *;
    `;
    const deleteResult = await pool.query(deleteJobQuery, [jobTitle]);
    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    return res.status(200).json({ message: 'Job removed successfully.' });
    
  } catch (error) {
    console.error('Error removing job:', error);
    return res.status(500).json({ error: 'Failed to remove job.' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to our application!' });
});

const PYTHON_API = "http://127.0.0.1:5001";

app.get("/start-email-listener", async (req, res) => {
    try {
        const response = await axios.get(`${PYTHON_API}/start`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Error starting email listener" });
    }
});

app.get("/stop-email-listener", async (req, res) => {
    try {
        const response = await axios.get(`${PYTHON_API}/stop`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Error stopping email listener" });
    }
});

app.get("/email-listener-status", async (req, res) => {
    try {
        const response = await axios.get(`${PYTHON_API}/status`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Error checking listener status" });
    }
});

app.listen(port, () => {
    console.log(`Node.js server running on http://localhost:${port}`);
});

