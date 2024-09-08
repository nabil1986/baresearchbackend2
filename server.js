require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const postmark = require('postmark');


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

//------------------------------------------------------------------------ Change password
app.put('/change-password', (req, res) => {
  const { username, currentPassword, newPassword } = req.body;

  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      console.error('Erreur SQL:', err);
      return res.status(500).json({ message: 'Erreur du serveur' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const user = results[0];

    bcrypt.compare(currentPassword, user.password, (err, isMatch) => {
      if (err) {
        console.error('Erreur bcrypt:', err);
        return res.status(500).json({ message: 'Erreur du serveur' });
      }

      if (!isMatch) {
        return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
      }

      bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        if (err) {
          console.error('Erreur de hachage:', err);
          return res.status(500).json({ message: 'Erreur du serveur' });
        }

        db.query('UPDATE users SET password = ? WHERE username = ?', [hashedPassword, username], (err, result) => {
          if (err) {
            console.error('Erreur SQL lors de la mise à jour:', err);
            return res.status(500).json({ message: 'Erreur lors de la mise à jour du mot de passe' });
          }

          res.status(200).json({ message: 'Mot de passe changé avec succès' });
        });
      });
    });
  });
});

//------------------------------------------------------------------------------change password

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

// Créez une instance du client Postmark avec votre clé API
const client = new postmark.ServerClient(process.env.POSTMARK_API_KEY);

app.post('/devices', async (req, res) => {
  try {
    console.log('Request body:', req.body);
    const {
      device_name,
      grease_quantity,
      grease_period,
      observation,
      niveau,
      numero_inventaire,
      designation_grade_graisse,
      ordre_passage,
      equipement_localisation,
      tempsGraissage,
      photo,
      gamme,
      designation_grade_huile,
      etage
    } = req.body;

    const createdAt = new Date();
    const dateProchainGraissage = calculateNextGreasingDate(createdAt, grease_period);

    console.log('Inserting data into database...');
    const query = `
      INSERT INTO devices
      (device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire,
      designation_grade_graisse, created_at, date_prochain_graissage, ordre_passage,
      equipement_localisation, tempsGraissage, photo, gamme, designation_grade_huile, etage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await new Promise((resolve, reject) => {
      db.query(query, [
        device_name,
        grease_quantity,
        grease_period,
        observation,
        niveau,
        numero_inventaire,
        designation_grade_graisse,
        createdAt,
        dateProchainGraissage,
        ordre_passage,
        equipement_localisation,
        tempsGraissage,
        photo,
        gamme,
        designation_grade_huile,
        etage
      ], (err, result) => {
        if (err) {
          console.error('Database query error:', err);
          return reject(err);
        }
        resolve(result);
      });
    });

    console.log('Data inserted successfully.');

    // Créer et envoyer un e-mail via Postmark
    console.log('Sending email...');
    const response = await client.sendEmail({
      From: 'n.kacimi@maghreblogiciel.com',
      To: 's.mounir@maghreblogiciel.com',
      Subject: 'Nouvel Appareil Ajouté',
      TextBody: `Un nouvel appareil a été ajouté :
        - Nom: ${device_name}
        - Numéro d'inventaire: ${numero_inventaire}
        - Quantité de graisse: ${grease_quantity}
        - Période de graissage: ${grease_period}
        - Observation: ${observation}
        - Date du prochain graissage: ${dateProchainGraissage}`,
      HtmlBody: `<p>Un nouvel appareil a été ajouté :</p>
        <ul>
          <li>Nom: ${device_name}</li>
          <li>Numéro d'inventaire: ${numero_inventaire}</li>
          <li>Quantité de graisse: ${grease_quantity}</li>
          <li>Période de graissage: ${grease_period}</li>
          <li>Observation: ${observation}</li>
          <li>Date du prochain graissage: ${dateProchainGraissage}</li>
        </ul>`
    });

    console.log('E-mail envoyé avec succès:', response);
    res.status(201).send(result);
  } catch (error) {
    console.error('Erreur dans la fonction POST /devices:', error);
    res.status(500).send('Erreur interne du serveur');
  }
});



{/* -----------------------------------------------post devices sauvegardée
app.post('/devices', (req, res) => {
  const { device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, ordre_passage, equipement_localisation, tempsGraissage, photo, gamme, designation_grade_huile, etage } = req.body;

  const createdAt = new Date();
  const dateProchainGraissage = calculateNextGreasingDate(createdAt, grease_period);


  const query = 'INSERT INTO devices (device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, created_at, date_prochain_graissage, ordre_passage, equipement_localisation, tempsGraissage, photo, gamme, designation_grade_huile, etage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, createdAt, dateProchainGraissage, ordre_passage, equipement_localisation, tempsGraissage, photo, gamme, designation_grade_huile, etage], (err, result) => {
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




*/}

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
  const { device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, ordre_passage, equipement_localisation, tempsGraissage, photo, gamme, designation_grade_huile, etage } = req.body;

  const query = 'UPDATE devices SET device_name = ?, grease_quantity = ?, grease_period = ?, observation = ?, niveau = ?, numero_inventaire = ?, designation_grade_graisse = ?, ordre_passage = ?, equipement_localisation = ?, tempsGraissage = ?, photo = ?, gamme = ?, designation_grade_huile = ?, etage = ? WHERE id = ?';
  db.query(query, [device_name, grease_quantity, grease_period, observation, niveau, numero_inventaire, designation_grade_graisse, ordre_passage, equipement_localisation, tempsGraissage, photo, gamme, designation_grade_huile, etage, id], (err, result) => {
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

//--------------------------------------------------------- Anomalies


app.use('/anomlies', authenticateJWT);

app.post('/anomlies', (req, res) => {
  const { anomlie, numero_inventaire, operateur } = req.body;
  const createdAt = new Date();
  const query = 'INSERT INTO anomlies (anomlie, numero_inventaire, created_at, operateur) VALUES (?, ?, ?, ?)';
  db.query(query, [anomlie, numero_inventaire, createdAt, operateur], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(201).send(result);
    }
  });
});

app.get('/anomlies', (req, res) => {
  const query = 'SELECT * FROM anomlies';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

app.get('/anomliesavecdesignation', (req, res) => {
  const query = 'SELECT anomlies.id, anomlies.anomlie, anomlies.numero_inventaire, anomlies.created_at, anomlies.operateur, devices.device_name FROM anomlies JOIN devices ON anomlies.numero_inventaire = devices.numero_inventaire ORDER BY anomlies.created_at DESC';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

app.put('/anomlies/:id', (req, res) => {
  const { id } = req.params;
  const { anomlie, numero_inventaire, operateur } = req.body;
  const query = 'UPDATE anomlies SET anomlie = ?, numero_inventaire = ?, operateur = ? WHERE id = ?';
  db.query(query, [anomlie, numero_inventaire, operateur, id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(result);
    }
  });
});

app.delete('/anomlies/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM anomlies WHERE id = ?';
  db.query(query, [id], (err, result) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(result);
    }
  });
});

//--------------------------------------------------------- Anomalies

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
  const { code_article, designation_article, type_article, localisation_article } = req.body;
  const query = 'INSERT INTO articles (code_article, designation_article, type_article, localisation_article) VALUES (?, ?, ?, ?)';
  db.query(query, [code_article, designation_article, type_article, localisation_article], (err, result) => {
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
  const { code_article, designation_article, type_article, localisation_article } = req.body;
  const query = 'UPDATE articles SET code_article = ?, designation_article = ?, type_article = ?, localisation_article = ? WHERE id = ?';
  db.query(query, [code_article, designation_article, type_article, localisation_article, id], (err, result) => {
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

app.get('/articles/typeArticles', (req, res) => {
  const query = 'SELECT DISTINCT type_article FROM articles';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

app.get('/articles/graisse', (req, res) => {
  const query = 'SELECT designation_article FROM articles where type_article = "G" ';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

app.get('/articles/huile', (req, res) => {
  const query = 'SELECT designation_article FROM articles where type_article = "H" ';
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

app.get('/operationgraissageavecdesignation', (req, res) => {
  const query = 'SELECT * FROM operationgraissage JOIN devices ON operationgraissage.numero_inventaire = devices.numero_inventaire';
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



//--------------------------------------------------------- localisation Equipement

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

//--------------------------------------------------------- localisation Equipement

//--------------------------------------------------------- localisation Article

app.use('/localisationarticle', authenticateJWT);

app.get('/localisationarticle', (req, res) => {
  const query = 'SELECT localisation FROM localisationArticle ORDER BY localisation ASC';
  db.query(query, (err, results) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(200).send(results);
    }
  });
});

//--------------------------------------------------------- localisation Article

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
