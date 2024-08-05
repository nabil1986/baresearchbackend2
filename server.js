require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed: ' + err.stack);
    return;
  }
  console.log('Connected to database.');
});

const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];

  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};



const calculateNextGreasingDate = (createdAt, greasePeriod) => {
  const date = new Date(createdAt);
  switch (greasePeriod) {
    case 'JOURNALIERE':
      date.setDate(date.getDate() + 1);
      break;
    case 'HEBDOMADAIRE':
      date.setDate(date.getDate() + 7);
      break;
    case 'MENSUELLE':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'BI MENSUELLE':
      date.setMonth(date.getMonth() + 2);
      break;
    case 'TRIMESTRIELLE':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'SEMESTRIELLE':
      date.setMonth(date.getMonth() + 6);
      break;
    case 'ANNUELLE':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      return null;
  }
  return date.toISOString().split('T')[0]; // Return date in YYYY-MM-DD format
};


app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
  db.query(query, [username, password], (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else if (results.length > 0) {
      const user = results[0];
      const token = jwt.sign({ username: user.username, typeUser: user.typeUser }, process.env.JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, typeUser: user.typeUser });
    } else {
      res.status(401).send('Invalid credentials');
    }
  });
});

app.use('/devices', authenticateJWT);

// Vérifier si un numéro d'inventaire existe déjà
app.get('/devices/check-numero-inventaire', (req, res) => {
  const { numero_inventaire } = req.query;
  const query = 'SELECT COUNT(*) AS count FROM devices WHERE numero_inventaire = ?';
  db.query(query, [numero_inventaire], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).json({ exists: result[0].count > 0 });
    }
  });
});


app.post('/devices', (req, res) => {
  const { device_name, grease_quantity, grease_period, observation, level_control, numero_inventaire, designation_grade_graisse, ordre_passage } = req.body;
  const level = level_control === 'oui' ? 1 : 0;
  const createdAt = new Date();
  const dateProchainGraissage = calculateNextGreasingDate(createdAt, grease_period);

  const query = 'INSERT INTO devices (device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, created_at, date_prochain_graissage, ordre_passage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [device_name, grease_quantity, grease_period, observation, level, numero_inventaire, designation_grade_graisse, createdAt, dateProchainGraissage, ordre_passage], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(201).send(result);
    }
  });
});

app.get('/devices', (req, res) => {
  const query = 'SELECT * FROM devices';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

app.put('/devices/:id', (req, res) => {
  const { id } = req.params;
  const { device_name, grease_quantity, grease_period, observation, level_control, numero_inventaire, designation_grade_graisse, ordre_passage } = req.body;
  const level = level_control === 'oui' ? 1 : 0;
  const createdAt = new Date();
  const dateProchainGraissage = calculateNextGreasingDate(createdAt, grease_period);

  const query = 'UPDATE devices SET device_name = ?, grease_quantity = ?, grease_period = ?, observation = ?, niveau = ?, numero_inventaire = ?, designation_grade_graisse = ?, date_prochain_graissage = ?, ordre_passage = ? WHERE id = ?';
  db.query(query, [device_name, grease_quantity, grease_period, observation, level, numero_inventaire, designation_grade_graisse, dateProchainGraissage, ordre_passage, id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(result);
    }
  });
});




app.delete('/devices/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM devices WHERE id = ?';
  db.query(query, [id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(result);
    }
  });
});

//--------------------------------------------------------- Articles

app.use('/articles', authenticateJWT);

// Vérifier si un code article existe déjà
app.get('/articles/check-code-article', (req, res) => {
  const { code_article } = req.query;
  const query = 'SELECT COUNT(*) AS count FROM articles WHERE code_article = ?';
  db.query(query, [code_article], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).json({ exists: result[0].count > 0 });
    }
  });
});

app.post('/articles', (req, res) => {
  const { code_article, designation_article } = req.body;
  const query = 'INSERT INTO articles (code_article, designation_article) VALUES (?, ?)';
  db.query(query, [code_article, designation_article], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(201).send(result);
    }
  });
});

app.get('/articles', (req, res) => {
  const query = 'SELECT * FROM articles';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

app.put('/articles/:id', (req, res) => {
  const { id } = req.params;
  const { code_article, designation_article } = req.body;
  const query = 'UPDATE articles SET code_article = ?, designation_article = ? WHERE id = ?';
  db.query(query, [code_article, designation_article, id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(result);
    }
  });
});

app.delete('/articles/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM articles WHERE id = ?';
  db.query(query, [id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(result);
    }
  });
});

app.get('/articles/designations', (req, res) => {
  const query = 'SELECT designation_article FROM articles';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

//--------------------------------------------------------- Articles

//--------------------------------------------------------- Graisse période
app.use('/graisse_periode', authenticateJWT);

app.get('/graisse_periode', (req, res) => {
  const query = 'SELECT periode FROM periodes';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

//--------------------------------------------------------- Graisse période



//--------------------------------------------------------- Opération Graisse
app.use('/operationgraissage', authenticateJWT);

app.post('/operationgraissage', (req, res) => {
  const { numero_inventaire, quantite_graisse, level_control, points_a_controler, termine, temps_graissage, anomalie_constatee } = req.body;
  const level = level_control === 'oui' ? 1 : 0;
  const query = 'INSERT INTO operationgraissage (numero_inventaire, quantite_graisse, niveau, points_a_controler, termine, temps_graissage, anomalie_constatee) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [numero_inventaire, quantite_graisse, level, points_a_controler, termine, temps_graissage, anomalie_constatee], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(201).send(result);
    }
  });
});

app.get('/operationgraissage', (req, res) => {
  const query = 'SELECT * FROM operationgraissage';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

app.put('/operationgraissage/:id', (req, res) => {
  const { id } = req.params;
  const { numero_inventaire, quantite_graisse, level_control, points_a_controler, termine, temps_graissage, anomalie_constatee } = req.body;
  const level = level_control === 'oui' ? 1 : 0;
  const query = 'UPDATE operationgraissage SET numero_inventaire = ?, quantite_graisse = ?, niveau = ?, points_a_controler = ?, termine = ?, temps_graissage = ?, anomalie_constatee = ? WHERE id = ?';
  db.query(query, [numero_inventaire, quantite_graisse, level, points_a_controler, termine, temps_graissage, anomalie_constatee, id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(result);
    }
  });
});

app.delete('/operationgraissage/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM operationgraissage WHERE id = ?';
  db.query(query, [id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(result);
    }
  });
});



//--------------------------------------------------------- Opération Graisse

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(3001, () => {
  console.log('Server is running on port 3001');
});
