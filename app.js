var express = require('express');
var app = express();
var server = require('http').Server(app);
var bodyParser = require('body-parser');
var shortid = require('shortid');
var mysql = require('mysql');
var bcrypt = require('bcrypt');
var reCAPTCHA = require('recaptcha2');
var sg = require('sendgrid')(process.env.SENDGRID_API_KEY || "N/A");

var startTime = 0;

var recaptcha = new reCAPTCHA({
    siteKey: (process.env.reCAPTCHA_key || "N/A"),
    secretKey: (process.env.reCAPTCHA_secret || "N/A")
});

var SERVER_PORT = process.env.PORT || 80;

var connection = mysql.createConnection({
    host: (process.env.DATABASE_URL || 'warriars.cc1145b8odu9.eu-central-1.rds.amazonaws.com'),
    user: (process.env.DATABASE_USER || "N/A"),
    password: (process.env.DATABASE_PASSWORD || "N/A"),
    database: (process.env.DATABASE || "N/A")
});


var mailTemplates = {
    verify: (process.env.SENDGRID_TEMPLATE || "N/A")
}

app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());

app.post('/taken', function (req, res) {
    var username = req.body.username;
    var email = req.body.email;

    if (email != undefined && username != undefined) {
        res.json({ error: "Please only check one at a time." });
        return;
    }

    var using = username != undefined ? username : (email != undefined ? email : undefined);
    var usingType = username != undefined ? "username" : (email != undefined ? "email" : undefined);

    /*if (username.lenght > 12 && usingType == "username") {
        res.json({ result: 'Longer than 12 characters.', type: usingType, value: using, available: false });
        return;
    } else */
    if (using == undefined) {
        res.json({ error: "Please select a username or an email to check." });
        return;
    } else if (using.length <= 0) {
        res.json({ result: 'Too short', type: usingType, value: using, available: false });
        return;
    } else {
        connection.query('SELECT id FROM users WHERE ' + usingType + '=? LIMIT 1', [using], function (error, results, fields) {
            if (error) {
                console.log(usingType, using);
                console.log(error);
                res.json({ error: "Unknown error." });
            } else if (results[0] == undefined) {
                res.json({ result: 'Available', type: usingType, value: using, available: true });
            } else {
                res.json({ result: 'Taken', type: usingType, value: using, available: false });
            }
        });
    }
});

app.post('/register', function (req, res) {
    var username = req.body.username,
        email = req.body.email,
        password = req.body.password,
        verifyPassword = req.body.verifyPassword,
        recaptchaKey = req.body.recaptcha;

    var ipAddress = req.headers['X-Forwarded-For'] || 'localhost.maybe';

    if (username.length <= 0) {
        res.json({ error: "A username is required." });
        return;
    } else if (username.length > 12) {
        res.json({ error: "The username is longer than 12 characters." });
        return;
    } else if (email.length <= 0) {
        res.json({ error: "An email is required." });
        return;
    } else if (password.length <= 0) {
        res.json({ error: "A password is required." });
        return;
    } else if (password != verifyPassword) {
        res.json({ error: "Your passwords don't match." });
        return;
    }

    var testUsername = /^[a-zA-Z0-9_.-øæåØÆÅ]*$/igm;
    var test = testUsername.test(username);

    if (!test) {
        res.json({ error: "Username contains illegal characters." });
        return;
    }

    if (!validateEmail(email)) {
        res.json({ error: "Invalid email format." });
        return;
    }

    recaptcha.validate(recaptchaKey)
        .then(function () {
            var currentID = shortid.generate();
            var verify = shortid.generate() + shortid.generate() + shortid.generate() + shortid.generate();
            bcrypt.genSalt(10, function (err, salt) {
                bcrypt.hash(password, salt, function (err, hash) {
                    connection.query('INSERT INTO `users` (username, password, salt, email, lat, lng, currentID, lastupdated, registered, verify, lastIP, registeredIP) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [username, hash, salt, email, 0, 0, currentID, UnixTimestamp(), UnixTimestamp(), verify, ipAddress, ipAddress], function (error, results, fields) {
                        if (error) {
                            if (error.code == "ER_DUP_ENTRY") {
                                var regex = /Duplicate entry '(.*?)' for key '(.*?)'/igm;
                                var m = regex.exec(error.sqlMessage);
                                var field = m[2];
                                res.json({ error: capitalizeFirstLetter(field) + " is already in use." });
                            } else {
                                console.log(error);
                                res.json({ error: "Unknown database error." });
                            }
                        } else {
                            sendEmail({ to: email, username: username, verify: verify, template: mailTemplates.verify });
                            res.json({ currentID: currentID, username: username });
                        }
                    });
                });
            });
        })
        .catch(function (errorCodes) {
            res.json({ error: "reCAPTCHA error: " + recaptcha.translateErrors(errorCodes) });
            return;
        });
});

app.post('/login', function (req, res) {
    var email = req.body.email,
        password = req.body.password;
    
    var ipAddress = req.headers['X-Forwarded-For'] || '127.0.0.1';
    if (email == undefined || email.length <= 0) {
        res.json({ error: "An email is required." });
        return;
    } else if (password == undefined || password.length <= 0) {
        res.json({ error: "A password is required." });
        return;
    }
    connection.query('SELECT salt, password, username, verify FROM users WHERE email=? LIMIT 1', [email], function (error, results, fields) {
        if (error) {
            console.log(error);
            res.json({ error: "Unknown error." });
        } else if (results[0] == undefined) {
            res.json({ error: 'Wrong Login Credentials.' });
        } else {
            var db_salt = results[0].salt;
            var db_password = results[0].password;
            var db_username = results[0].username;
            var db_verify = results[0].verify;
            
            if(db_verify) {
                res.json({ error: 'Account not verified.' });
                return;
            }

            bcrypt.hash(password, db_salt, function (err, hash) {
                if (db_password === hash) {
                    var currentID = shortid.generate();
                    connection.query('UPDATE users SET currentID=?, lastupdated=?, lastIP=? WHERE email=?', [currentID, UnixTimestamp(), ipAddress, email], function (error, results, fields) {
                        res.json({ currentID: currentID, username: db_username });
                    });
                } else {
                    res.json({ error: 'Wrong Login Credentials.' });
                }
            });
        }
    });
});

app.post('/relog', function (req, res) {
    var currentID = req.body.currentID,
        email = req.body.email;
    
    var ipAddress = req.headers['X-Forwarded-For'] || '127.0.0.1';
    if (currentID == undefined || currentID.length <= 0) {
        res.json({ error: "An ID is required." });
        return;
    }
    if (email == undefined || email.length <= 0) {
        res.json({ error: "An email is required." });
        return;
    }

    connection.query('SELECT username, verify FROM users WHERE email=? AND currentID=? LIMIT 1', [email, currentID], function (error, results, fields) {
        if (error) {
            console.log(error);
            res.json({ error: "Unknown error." });
        } else if (results[0] == undefined) {
            res.json({ error: 'Wrong Login Credentials.' });
        } else {
            var db_username = results[0].username;
            var db_verify = results[0].verify;
            if(db_verify) {
                res.json({ error: 'Account not verified.' });
                return;
            }

            currentID = shortid.generate();
            connection.query('UPDATE users SET currentID=?, lastupdated=?, lastIP=? WHERE email=?', [currentID, UnixTimestamp(), ipAddress, email], function (error, results, fields) {
                res.json({ currentID: currentID, username: db_username });
            });
        }
    });
});

app.get('/verify', function(req, res) {
    var id = req.query.id;
    var ipAddress = req.headers['X-Forwarded-For'] || '127.0.0.1';
    if(!id) {
        res.json({ error: "An id is required." });
        return;
    }
    connection.query('SELECT username FROM users WHERE verify=? LIMIT 1', [id], function (error, results, fields) {
        if (error) {
            console.log(error);
            res.json({ error: "Unknown error." });
        } else if (results[0] == undefined) {
            res.json({ error: 'Id not found. Already verified?' });
        } else {
            connection.query('UPDATE users SET verify=?, lastupdated=?, lastIP=? WHERE verify=?', [null, UnixTimestamp(), ipAddress, id], function (error, results, fields) {
                if (error) {
                    console.log(error);
                    res.json({ error: "Unknown error." });
                } else {
                    res.json({ result: "Verified." });
                }
            });
        }
    });
});

app.use('/register', express.static('public/register'));
app.use('/static', express.static('public/static'));

app.get('/', function (req, res) {
    res.json({ status: "online", uptime: (UnixTimestamp() - startTime) });
});

server.listen(SERVER_PORT);
console.log("Started listening on port " + SERVER_PORT);

var UnixTimestamp = function () {
    return Math.floor(new Date() / 1000);
}

startTime = UnixTimestamp();

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

var validateEmail = function (email) {
    var uni = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return uni.test(email);
}

var sendEmail = function (data) {
    var request = sg.emptyRequest();
    request.body = {
        "from": {
            "email": "noreply@warriars.fun",
            "name": "WarriARs"
        },
        "personalizations": [
            {
                "to": [
                    {
                        "email": data.to,
                        "name": data.username
                    }
                ],
                "substitutions": {
                    "-username-": data.username,
                    "-verify-": data.verify
                }
            }
        ],
        "template_id": data.template
    };
    request.method = 'POST';
    request.path = '/v3/mail/send';
    sg.API(request, function (error, response) {
        if (error) {
            console.log('Error response received');
        }
    });
}