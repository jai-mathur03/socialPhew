const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');  // Make sure this import is at the top
const multer = require('multer');
require('dotenv').config();
const app = express();

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(cors({
    origin: ['https://socialphew.onrender.com', 'http://localhost:5002'],
    credentials: true
}));


app.use(express.static(path.join(__dirname, '../Frontend')));
// MongoDB Connection
mongoose.connect("mongodb+srv://jaiadityamathur2022:nA7yvXLpXVcfnCye@cluster0.eto5t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => {
        console.log('MongoDB Connected Successfully');
        initializeAdmin();
        initializeContent();
    })
    .catch(err => console.error('MongoDB Connection Failed:', err));


// Schemas
const profilePictureSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  data: { type: Buffer, required: true },
  contentType: { type: String, required: true }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  designation: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isApproved: { type: Boolean, default: false },
  profilePictureId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfilePicture' },
  connections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  requests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const contentSchema = new mongoose.Schema({
  content: { type: String, required: true },
  lastUpdated: { type: Date, default: Date.now }
});

// Models
const ProfilePicture = mongoose.model('ProfilePicture', profilePictureSchema);
const User = mongoose.model('User', userSchema);
const Admin = mongoose.model('Admin', adminSchema);
const Content = mongoose.model('Content', contentSchema);

// Authentication Middleware
const authenticate = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Admin Middleware
const verifyAdmin = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.user.id);
    if (!admin) return res.status(403).json({ message: 'Admin access required' });
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Initialize Admin
const initializeAdmin = async () => {
  try {
    const admins = [
      { email: "Socialite@gmail.com", password: "adminSocialite123" },
      { email: "Hitachi@gmail.com", password: "adminHitachi123" }
    ];
    
    for (const admin of admins) {
      const existingAdmin = await Admin.findOne({ email: admin.email });
      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        await Admin.create({ email: admin.email, password: hashedPassword });
        console.log(`Admin initialized: ${admin.email}`);
      }
    }
  } catch (error) {
    console.error('Admin initialization error:', error);
  }
};

// Initialize Content
const initializeContent = async () => {
  try {
    const existingContent = await Content.findOne();
    if (!existingContent) {
      await Content.create({ content: 'Welcome to Socialite!' });
      console.log('Default content initialized');
    }
  } catch (error) {
    console.error('Content initialization error:', error);
  }
};

// Routes
// Auth Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend', 'frontPage.html'));
});
app.post('/api/auth/register', upload.single('profilePicture'), async (req, res) => {
  try {
      const { name, designation, email, password, confirmPassword } = req.body;

      if (password !== confirmPassword) {
          return res.status(400).json({ message: 'Passwords do not match' });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
          return res.status(400).json({ message: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user first
      const newUser = await User.create({
          name,
          designation,
          email,
          password: hashedPassword
      });

      // Store profile picture if provided
      if (req.file) {
          const profilePicture = new ProfilePicture({
              userId: newUser._id,
              data: req.file.buffer,
              contentType: req.file.mimetype
          });
          const savedPicture = await profilePicture.save();
          
          // Update user with profile picture reference
          newUser.profilePictureId = savedPicture._id;
          await newUser.save();
      }

      res.status(201).json({ message: 'User registered. Awaiting admin approval.' });
  } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/profilePicture/:userId', async (req, res) => {
  try {
      const user = await User.findById(req.params.userId);
      if (!user || !user.profilePictureId) {
          return res.redirect('https://via.placeholder.com/150');
      }

      const profilePicture = await ProfilePicture.findById(user.profilePictureId);
      if (!profilePicture) {
          return res.redirect('https://via.placeholder.com/150');
      }

      res.set('Content-Type', profilePicture.contentType);
      res.send(profilePicture.data);
  } catch (error) {
      console.error('Error serving profile picture:', error);
      res.redirect('https://via.placeholder.com/150');
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.isApproved) {
      return res.status(403).json({ message: 'Account pending approval' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { ...user.toObject(), password: undefined } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/auth/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    const token = jwt.sign(
      { id: admin._id, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({ token });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// User Routes
app.get('/api/users/me', authenticate, async (req, res) => {
  try {
    if (req.user.isAdmin) {
      const admin = await Admin.findById(req.user.id);
      if (admin) {
        return res.json({ isAdmin: true });
      }
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ isAdmin: false, ...user.toObject(), password: undefined });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Connection Routes
app.get('/api/members', authenticate, async (req, res) => {
  try {
      const currentUser = await User.findById(req.user.id);
      const members = await User.find({
          _id: { $ne: req.user.id },
          isApproved: true
      }).select('name profilePictureId _id');

      const membersWithStatus = members.map(member => ({
          ...member.toObject(),
          isConnected: (currentUser.connections || []).includes(member._id),
          requestSent: (member.requests || []).includes(currentUser._id),
          requestReceived: (currentUser.requests || []).includes(member._id)
      }));

      res.json(membersWithStatus);
  } catch (error) {
      console.error('Get members error:', error);
      res.status(500).json({ message: 'Server error' });
  }
});
app.get('/api/connections', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('connections', 'name designation email profilePicture');
    res.json(user.connections);
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/connections/requests', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('requests', 'name profilePicture');
    res.json(user.requests);
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/connections/request/:id', authenticate, async (req, res) => {
  try {
    const toUser = await User.findById(req.params.id);
    const fromUser = await User.findById(req.user.id);
    
    if (!toUser || !fromUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (toUser.requests.includes(fromUser._id)) {
      return res.status(400).json({ message: 'Request already sent' });
    }
    
    toUser.requests.push(fromUser._id);
    await toUser.save();
    res.json({ message: 'Connection request sent' });
  } catch (error) {
    console.error('Send request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/connections/respond/:id', authenticate, async (req, res) => {
  try {
    const { action } = req.body;
    const currentUser = await User.findById(req.user.id);
    const requestUser = await User.findById(req.params.id);
    
    if (!currentUser || !requestUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    currentUser.requests = currentUser.requests.filter(
      id => id.toString() !== req.params.id
    );
    
    if (action === 'accept') {
      currentUser.connections.push(req.params.id);
      requestUser.connections.push(req.user.id);
      await requestUser.save();
    }
    
    await currentUser.save();
    res.json({ message: `Request ${action}ed successfully` });
  } catch (error) {
    console.error('Respond to request error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/admin/reject/:id', authenticate, verifyAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User rejected and removed' });
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/getContent', async (req, res) => {
  try {
    const content = await Content.findOne();
    if (!content) {
      return res.status(404).json({ message: 'Content not found' });
    }
    res.json(content);
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/updateContent', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }
    
    const updatedContent = await Content.findOneAndUpdate(
      {},
      { content, lastUpdated: Date.now() },
      { new: true, upsert: true }
    );
    
    res.json({
      message: 'Content updated successfully',
      content: updatedContent
    });
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Admin Routes
app.get('/api/admin/pending-requests', authenticate, verifyAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find({ isApproved: false })
      .select('name email designation');
    res.json(pendingUsers);
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/admin/approve/:id', authenticate, verifyAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    user.isApproved = true;
    await user.save();
    res.json({ message: 'User approved successfully' });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/approved-members', async (req, res) => {
    try {
        const approvedMembers = await User.find({ 
            isApproved: true 
        }).select('name designation _id');
        
        res.json(approvedMembers);
    } catch (error) {
        console.error('Error fetching approved members:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
