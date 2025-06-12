const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const docker = new Docker();
const PORT = process.env.PORT || 3080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/assets/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ storage: storage });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/containers', async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: true });
        const detailedContainers = containers.map(c => ({
            id: c.Id,
            name: c.Names[0].replace(/^\//, ''),
            state: c.State,
            status: c.Status
        }));
        res.json(detailedContainers);
    } catch (error) {
        res.status(500).json({ error: 'Error retrieving containers', details: error.message });
    }
});

app.post('/api/containers/:id/start', async (req, res) => {
    try {
        const container = docker.getContainer(req.params.id);
        await container.start();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error starting container', details: error.message });
    }
});

app.post('/api/containers/:id/stop', async (req, res) => {
    try {
        const container = docker.getContainer(req.params.id);
        await container.stop();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error stopping container', details: error.message });
    }
});

app.get('/api/containers/name/:name', async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: true });
        const container = containers.find(c => 
            c.Names.some(n => n.replace(/^\//, '').includes(req.params.name))
        );
        
        if (container) {
            res.json({
                id: container.Id,
                name: container.Names[0].replace(/^\//, ''),
                state: container.State,
                status: container.Status
            });
        } else {
            res.status(404).json({ error: 'Container not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error finding container', details: error.message });
    }
});

app.post('/api/containers/settings/:id', upload.single('icon'), async (req, res) => {
  try {
    const containerId = req.params.id;
    const newName = req.body.name;
    const iconPath = req.file ? `/assets/${req.file.filename}` : null;
    
    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync('public/containerSettings.json', 'utf8'));
    } catch (err) {
      settings = {};
    }
    
    settings[containerId] = {
      customName: newName,
      iconPath: iconPath || settings[containerId]?.iconPath
    };
    
    fs.writeFileSync('public/containerSettings.json', JSON.stringify(settings, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error updating settings', details: error.message });
  }
});
app.get('/api/containers/settings', (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync('public/containerSettings.json', 'utf8'));
    res.json(settings);
  } catch (error) {
    res.json({});
  }
});

app.get('/api/app-settings', (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync('public/appSettings.json', 'utf8'));
    res.json(settings);
  } catch (error) {
    res.json({ servers: [] });
  }
});

app.post('/api/app-settings/servers', express.json(), (req, res) => {
  try {
    const { name, address, port } = req.body;
    let settings = { servers: [] };
    
    try {
      settings = JSON.parse(fs.readFileSync('public/appSettings.json', 'utf8'));
    } catch (err) {
      settings = { servers: [] };
    }
    
    settings.servers.push({ name, address, port });
    fs.writeFileSync('public/appSettings.json', JSON.stringify(settings, null, 2));
    
    res.json({ success: true, servers: settings.servers });
  } catch (error) {
    res.status(500).json({ error: 'Error saving server settings', details: error.message });
  }
});


app.delete('/api/app-settings/servers/:index', (req, res) => {
  try {
    const serverIndex = parseInt(req.params.index);
    let settings = { servers: [] };
    
    try {
      settings = JSON.parse(fs.readFileSync('public/appSettings.json', 'utf8'));
    } catch (err) {
      settings = { servers: [] };
    }
    
    if (serverIndex >= 0 && serverIndex < settings.servers.length) {
      settings.servers.splice(serverIndex, 1);
      fs.writeFileSync('public/appSettings.json', JSON.stringify(settings, null, 2));
      res.json({ success: true, servers: settings.servers });
    } else {
      res.status(404).json({ error: 'Server not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error deleting server', details: error.message });
  }
});

app.put('/api/app-settings/servers/:index', express.json(), (req, res) => {
  try {
    const serverIndex = parseInt(req.params.index);
    const { name, address, port } = req.body;
    let settings = { servers: [] };
    
    try {
      settings = JSON.parse(fs.readFileSync('public/appSettings.json', 'utf8'));
    } catch (err) {
      settings = { servers: [] };
    }
    
    if (serverIndex >= 0 && serverIndex < settings.servers.length) {
      settings.servers[serverIndex] = { name, address, port };
      fs.writeFileSync('public/appSettings.json', JSON.stringify(settings, null, 2));
      res.json({ success: true, servers: settings.servers });
    } else {
      res.status(404).json({ error: 'Server not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error updating server', details: error.message });
  }
});

app.put('/api/app-settings/sort', express.json(), (req, res) => {
  try {
    const { containerSort } = req.body;
    let settings = { servers: [], containerSort: 'none' };
    
    try {
      settings = JSON.parse(fs.readFileSync('public/appSettings.json', 'utf8'));
    } catch (err) {
      settings = { servers: [], containerSort: 'none' };
    }
    
    settings.containerSort = containerSort;
    fs.writeFileSync('public/appSettings.json', JSON.stringify(settings, null, 2));
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: 'Error saving sort preference', details: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));