require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');


const app = express();
app.use(bodyParser.json());
app.use(cors());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

{/*const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 5000 // délai d'attente en ms
});
const sendEmail = (to, subject, text) => {
 const mailOptions = {
  from: '"Nabil" <n.kacimi@maghreblogiciel.com>', // sender address
  to: 'kaciminabil@gmail.com', // list of receivers
  subject: 'Subject of your email', // Subject line
  text, // plain text body
 };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email: ', error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
};*/}



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



{/*app.post('/login', (req, res) => {
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
});*/}

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM users WHERE username = ?';

  db.query(query, [username], (err, results) => {
    if (err) {
      return res.status(500).send('Erreur du serveur');
    }

    if (results.length === 0) {
      return res.status(401).send('Nom d\'utilisateur ou mot de passe incorrect');
    }

    const user = results[0];

    // Comparer le mot de passe saisi avec le mot de passe haché
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res.status(500).send('Erreur lors de la comparaison des mots de passe');
      }

      if (isMatch) {
        const token = jwt.sign({ username: user.username, typeUser: user.typeUser }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, typeUser: user.typeUser });
      } else {
        res.status(401).send('Nom d\'utilisateur ou mot de passe incorrect');
      }
    });
  });
});


//----------------------------------------------------------------------- Register
//app.use('/register', authenticateJWT);

app.post('/register', (req, res) => {
  const { username, password, typeUser } = req.body;

  // Vérifier si le username existe déjà
  const checkQuery = 'SELECT * FROM users WHERE username = ?';

  db.query(checkQuery, [username], (err, results) => {
    if (err) {
      return res.status(500).send('Erreur du serveur');
    }

    if (results.length > 0) {
      return res.status(400).send('Nom d\'utilisateur déjà pris');
    }

    // Hacher le mot de passe avant de l'enregistrer
    const saltRounds = 10;

    bcrypt.hash(password, saltRounds, (err, hash) => {
      if (err) {
        console.error('Erreur lors du hachage du mot de passe:', err);
        return res.status(500).send('Erreur lors du hachage du mot de passe');
      }

      // Insérer le nouvel utilisateur dans la base de données
      const insertQuery = 'INSERT INTO users (username, password, typeUser) VALUES (?, ?, ?)';
      db.query(insertQuery, [username, hash, typeUser], (err, result) => {
        if (err) {
          return res.status(500).send('Erreur lors de l\'insertion de l\'utilisateur');
        }
        res.status(201).send('Utilisateur enregistré avec succès');
      });
    });
  });
});

//----------------------------------------------------------------------- Register

//app.use('/devices', authenticateJWT);

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
  const { device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, ordre_passage, equipement_localisation, tempsGraissage, photo } = req.body;

  const createdAt = new Date();
  const dateProchainGraissage = calculateNextGreasingDate(createdAt, grease_period);

  const query = 'INSERT INTO devices (device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, created_at, date_prochain_graissage, ordre_passage, equipement_localisation, tempsGraissage, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, createdAt, dateProchainGraissage, ordre_passage, equipement_localisation, tempsGraissage, photo], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(201).send(result);

      // Fonction sendEmail définie dans la portée de la route
            const transporter = nodemailer.createTransport({
              host: process.env.EMAIL_HOST,
              port: process.env.EMAIL_PORT,
              secure: false,
              auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
              },
              connectionTimeout: 5000, // délai d'attente en ms
            });

            const sendEmail = (to, subject, text) => {
              const mailOptions = {
                from: '"Nabil" <n.kacimi@maghreblogiciel.com>',
                to,
                subject,
                text,
              };

              transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                  console.error('Error sending email: ', error);
                } else {
                  console.log('Email sent: ' + info.response);
                }
              });
            };

            // Envoyer l'email après l'insertion réussie dans la base de données
            const emailText = `Un nouvel appareil a été ajouté:
              - Nom: ${device_name}
              - Numéro d'inventaire: ${numero_inventaire}
              - Quantité de graisse: ${grease_quantity}
              - Période de graissage: ${grease_period}
              - Observation: ${observation}
              - Date du prochain graissage: ${dateProchainGraissage}`;

            sendEmail('kaciminabil@gmail.com', 'Nouvel Appareil Ajouté', emailText);

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
  const { device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, ordre_passage, equipement_localisation, tempsGraissage, photo } = req.body;
  const createdAt = new Date();
  const dateProchainGraissage = calculateNextGreasingDate(createdAt, grease_period);

  const query = 'UPDATE devices SET device_name = ?, grease_quantity = ?, grease_period = ?, observation = ?, niveau = ?, numero_inventaire = ?, designation_grade_graisse = ?, date_prochain_graissage = ?, ordre_passage = ?, equipement_localisation = ?, tempsGraissage = ?, photo = ? WHERE id = ?';
  db.query(query, [device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, dateProchainGraissage, ordre_passage, equipement_localisation, tempsGraissage, photo, id], (err, result) => {
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
  const { numero_inventaire, quantite_graisse, level_control, points_a_controler, termine, temps_graissage, anomalie_constatee, operateur } = req.body;
  const level = level_control === 'oui' ? 1 : 0;
  const query = 'INSERT INTO operationgraissage (numero_inventaire, quantite_graisse, niveau, points_a_controler, termine, temps_graissage, anomalie_constatee, operateur) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [numero_inventaire, quantite_graisse, level, points_a_controler, termine, temps_graissage, anomalie_constatee, operateur], (err, result) => {
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
  const { numero_inventaire, quantite_graisse, level_control, anomalie_constatee, operateur } = req.body;
  const level = level_control === 'oui' ? 1 : 0;
  const query = 'UPDATE operationgraissage SET numero_inventaire = ?, quantite_graisse = ?, niveau = ?, anomalie_constatee = ?, operateur = ? WHERE id = ?';
  db.query(query, [numero_inventaire, quantite_graisse, level, anomalie_constatee, operateur, id], (err, result) => {
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


//--------------------------------------------------------- typeControle

app.use('/typeControle', authenticateJWT);

app.get('/typeControle', (req, res) => {
  const query = 'SELECT type FROM typeControle';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

//--------------------------------------------------------- typeControle



//--------------------------------------------------------- localisation

app.use('/localisationequipement', authenticateJWT);

app.get('/localisationequipement', (req, res) => {
  const query = 'SELECT localisation FROM localisationequipement ORDER BY localisation ASC';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

//--------------------------------------------------------- localisation

// --------------------------------------------------------------------Update date prochain graissage dans devices apres operation de graissage
app.use('/devices/:id/date-prochain-graissage', authenticateJWT);
app.put('/devices/:id/date-prochain-graissage', authenticateJWT, (req, res) => {
  const { id } = req.params;

  // Étape 1: Récupérer le grease_period du device
  const getDeviceQuery = 'SELECT grease_period FROM devices WHERE id = ?';
  db.query(getDeviceQuery, [id], (err, results) => {
    if (err) {
      return res.status(500).send(err);
    }
    if (results.length === 0) {
      return res.status(404).send('Device not found');
    }

    const grease_period = results[0].grease_period;

    // Étape 2: Calculer la date de prochain graissage
    const createdAt = new Date();
    const dateProchainGraissage = calculateNextGreasingDate(createdAt, grease_period);

    // Étape 3: Mettre à jour la date de prochain graissage
    const updateQuery = 'UPDATE devices SET date_prochain_graissage = ? WHERE id = ?';
    db.query(updateQuery, [dateProchainGraissage, id], (err, result) => {
      if (err) {
        res.status(500).send(err);
      } else {
        res.status(200).send(result);
      }
    });
  });
});


//--------------------------------------------------------- Update date prochain graissage dans devices apres operation de graissage


app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(3001, () => {
  console.log('Server is running on port 3001');
});
