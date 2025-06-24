const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const https = require('https');
const axios = require('axios');

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
    
    const containers = await docker.listContainers({ all: true });
    const container = containers.find(c => c.Id === containerId);
    if (!container) {
      throw new Error('Container non trovato');
    }
    
    const containerName = container.Names[0].replace(/^\//, '').replace(/[^a-zA-Z0-9]/g, '-');
    
    let iconPath = null;
    if (req.file) {
      const extension = req.file.filename.split('.').pop();
      const newFilename = `${containerId}-${containerName}.${extension}`;
      fs.renameSync(
        `public/assets/${req.file.filename}`,
        `public/assets/${newFilename}`
      );
      iconPath = `/assets/${newFilename}`;
    }
    
    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync('public/containerSettings.json', 'utf8'));
    } catch (err) {
      settings = {};
    }
    
    settings[containerId] = {
      customName: newName,
      iconPath: iconPath || settings[containerId]?.iconPath,
      originalName: containerName
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

app.get('/api/search-icon/:name', async (req, res) => {
  try {
    const iconName = req.params.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const formats = ['svg', 'png', 'webp'];
    const variants = ['', '-dark', '-light'];
    
    const availableIcons = [];

    for (const format of formats) {
      for (const variant of variants) {
        const url = `https://cdn.jsdelivr.net/gh/selfhst/icons/${format}/${iconName}${variant}.${format}`;
        try {
          const response = await axios.head(url);
          if (response.status === 200) {
            availableIcons.push({
              url,
              format,
              variant: variant || 'default'
            });
          }
        } catch (error) {
          continue;
        }
      }
    }

    if (availableIcons.length === 0) {
      res.status(404).json({ error: 'Nessuna icona trovata' });
    } else {
      res.json(availableIcons);
    }
  } catch (error) {
    res.status(500).json({ error: 'Errore nella ricerca dell\'icona', details: error.message });
  }
});

app.post('/api/download-icon', async (req, res) => {
  try {
    const { url, containerId } = req.body;
    
    const containers = await docker.listContainers({ all: true });
    const container = containers.find(c => c.Id === containerId);
    if (!container) {
      throw new Error('Container non trovato');
    }
    
    const containerName = container.Names[0].replace(/^\//, '').replace(/[^a-zA-Z0-9]/g, '-');
    
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    
    const extension = url.split('.').pop();
    const filename = `${containerId}-${containerName}.${extension}`;
    
    fs.writeFileSync(`public/assets/${filename}`, buffer);
    
    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync('public/containerSettings.json', 'utf8'));
    } catch (err) {
      settings = {};
    }
    
    if (!settings[containerId]) {
      settings[containerId] = {};
    }
    settings[containerId].iconPath = `/assets/${filename}`;
    settings[containerId].originalName = containerName;
    
    fs.writeFileSync('public/containerSettings.json', JSON.stringify(settings, null, 2));
    
    res.json({ 
      success: true, 
      iconPath: `/assets/${filename}` 
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel download dell\'icona', details: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));