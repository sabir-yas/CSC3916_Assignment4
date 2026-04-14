/*
CSC3916 HW4
File: Server.js
Description: Web API scaffolding for Movie API with Reviews
*/

require('dotenv').config();
var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var authController = require('./auth');
var authJwtController = require('./auth_jwt');
var jwt = require('jsonwebtoken');
var cors = require('cors');
var User = require('./Users');
var Movie = require('./Movies');
var Review = require('./Reviews');
const crypto = require('crypto');
var rp = require('request-promise');

var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();

const GA_TRACKING_ID = process.env.GA_TRACKING_ID;
const GA_API_SECRET = process.env.GA_API_SECRET;

// Google Analytics 4 Measurement Protocol tracking
function trackEvent(movieTitle, genre, action, label) {
    if (!GA_TRACKING_ID || GA_TRACKING_ID === 'G-XXXXXXXXXX') return Promise.resolve();

    var options = {
        method: 'POST',
        url: 'https://www.google-analytics.com/mp/collect?measurement_id=' + GA_TRACKING_ID + '&api_secret=' + GA_API_SECRET,
        json: true,
        body: {
            client_id: crypto.randomBytes(16).toString('hex'),
            events: [{
                name: 'movie_review',
                params: {
                    event_category: genre || 'Unknown',
                    event_action: action,
                    event_label: label,
                    event_value: 1,
                    movie_name: movieTitle,
                    review_count: 1
                }
            }]
        },
        headers: { 'Cache-Control': 'no-cache' }
    };

    return rp(options).catch(function(err) {
        console.log('GA tracking error:', err.message);
    });
}

function getJSONObjectForMovieRequirement(req) {
    var json = {
        headers: "No headers",
        key: process.env.UNIQUE_KEY,
        body: "No body"
    };

    if (req.body != null) {
        json.body = req.body;
    }

    if (req.headers != null) {
        json.headers = req.headers;
    }

    return json;
}

// ─── AUTH ROUTES ────────────────────────────────────────────────────────────

router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({ success: false, msg: 'Please include both username and password to signup.' });
    } else {
        var user = new User();
        user.name = req.body.name;
        user.username = req.body.username;
        user.password = req.body.password;

        user.save(function(err) {
            if (err) {
                if (err.code == 11000)
                    return res.json({ success: false, message: 'A user with that username already exists.' });
                else
                    return res.json(err);
            }
            res.json({ success: true, msg: 'Successfully created new user.' });
        });
    }
});

router.post('/signin', function(req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }

        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json({ success: true, token: 'JWT ' + token });
            } else {
                res.status(401).send({ success: false, msg: 'Authentication failed.' });
            }
        });
    });
});

// ─── MOVIE ROUTES ────────────────────────────────────────────────────────────

router.route('/movies')
    .get(authJwtController.isAuthenticated, function(req, res) {
        if (req.query.reviews === 'true') {
            // Aggregate movies with their reviews
            Movie.aggregate([
                {
                    $lookup: {
                        from: 'reviews',
                        localField: '_id',
                        foreignField: 'movieId',
                        as: 'reviews'
                    }
                },
                {
                    $addFields: {
                        avgRating: { $avg: '$reviews.rating' }
                    }
                },
                {
                    $sort: { avgRating: -1 }
                }
            ]).exec(function(err, movies) {
                if (err) return res.status(500).json(err);
                res.json(movies);
            });
        } else {
            Movie.find({}, function(err, movies) {
                if (err) return res.status(500).json(err);
                res.json(movies);
            });
        }
    })
    .post(authJwtController.isAuthenticated, function(req, res) {
        if (!req.body.title || !req.body.releaseDate || !req.body.genre || !req.body.actors) {
            return res.status(400).json({ success: false, message: 'Please provide title, releaseDate, genre, and actors.' });
        }
        if (!Array.isArray(req.body.actors) || req.body.actors.length < 3) {
            return res.status(400).json({ success: false, message: 'Please provide at least 3 actors.' });
        }

        var movie = new Movie();
        movie.title = req.body.title;
        movie.releaseDate = req.body.releaseDate;
        movie.genre = req.body.genre;
        movie.actors = req.body.actors;
        if (req.body.imageUrl) movie.imageUrl = req.body.imageUrl;

        movie.save(function(err) {
            if (err) {
                if (err.code == 11000)
                    return res.json({ success: false, message: 'A movie with that title already exists.' });
                else
                    return res.status(500).json(err);
            }
            res.json({ success: true, message: 'Movie saved!', movie: movie });
        });
    })
    .put(authJwtController.isAuthenticated, function(req, res) {
        res.status(405).json({ success: false, message: 'Method not supported, use /movies/:id instead.' });
    })
    .delete(authJwtController.isAuthenticated, function(req, res) {
        res.status(405).json({ success: false, message: 'Method not supported, use /movies/:id instead.' });
    });

router.route('/movies/search')
    .post(authJwtController.isAuthenticated, function(req, res) {
        var query = {};
        if (req.body.title || req.body.actorName) {
            query['$or'] = [];
            if (req.body.title)
                query['$or'].push({ title: { $regex: req.body.title, $options: 'i' } });
            if (req.body.actorName)
                query['$or'].push({ 'actors.actorName': { $regex: req.body.actorName, $options: 'i' } });
        }
        Movie.aggregate([
            { $match: query },
            { $lookup: { from: 'reviews', localField: '_id', foreignField: 'movieId', as: 'reviews' } },
            { $addFields: { avgRating: { $avg: '$reviews.rating' } } },
            { $sort: { avgRating: -1 } }
        ]).exec(function(err, movies) {
            if (err) return res.status(500).json(err);
            res.json(movies);
        });
    });

router.route('/movies/:id')
    .get(authJwtController.isAuthenticated, function(req, res) {
        if (req.query.reviews === 'true') {
            Movie.aggregate([
                {
                    $match: { _id: new require('mongoose').Types.ObjectId(req.params.id) }
                },
                {
                    $lookup: {
                        from: 'reviews',
                        localField: '_id',
                        foreignField: 'movieId',
                        as: 'reviews'
                    }
                },
                {
                    $addFields: {
                        avgRating: { $avg: '$reviews.rating' }
                    }
                }
            ]).exec(function(err, result) {
                if (err) return res.status(500).json(err);
                if (!result || result.length === 0) return res.status(404).json({ success: false, message: 'Movie not found.' });

                var movie = result[0];
                // Fire GA event for the movie lookup
                trackEvent(movie.title, movie.genre, 'GET /movies/:id?reviews=true', 'API Request for Movie Review');

                res.json(movie);
            });
        } else {
            Movie.findById(req.params.id, function(err, movie) {
                if (err) return res.status(500).json(err);
                if (!movie) return res.status(404).json({ success: false, message: 'Movie not found.' });
                res.json(movie);
            });
        }
    })
    .put(authJwtController.isAuthenticated, function(req, res) {
        Movie.findByIdAndUpdate(req.params.id, req.body, { new: true }, function(err, movie) {
            if (err) return res.status(500).json(err);
            if (!movie) return res.status(404).json({ success: false, message: 'Movie not found.' });
            res.json({ success: true, message: 'Movie updated!', movie: movie });
        });
    })
    .delete(authJwtController.isAuthenticated, function(req, res) {
        Movie.findByIdAndRemove(req.params.id, function(err, movie) {
            if (err) return res.status(500).json(err);
            if (!movie) return res.status(404).json({ success: false, message: 'Movie not found.' });
            res.json({ success: true, message: 'Movie deleted!' });
        });
    });

// ─── REVIEW ROUTES ───────────────────────────────────────────────────────────

router.route('/reviews')
    .get(authJwtController.isAuthenticated, function(req, res) {
        Review.find({}, function(err, reviews) {
            if (err) return res.status(500).json(err);
            res.json(reviews);
        });
    })
    .post(authJwtController.isAuthenticated, function(req, res) {
        // username comes from the JWT token
        var username = req.user.username;
        var movieId = req.body.movieId;
        var reviewText = req.body.review;
        var rating = req.body.rating;

        if (!movieId || !reviewText || rating === undefined) {
            return res.status(400).json({ success: false, message: 'Please provide movieId, review, and rating.' });
        }

        // Verify movie exists
        Movie.findById(movieId, function(err, movie) {
            if (err) return res.status(500).json(err);
            if (!movie) return res.status(404).json({ success: false, message: 'Movie not found.' });

            var review = new Review();
            review.movieId = movieId;
            review.username = username;
            review.review = reviewText;
            review.rating = rating;

            review.save(function(err) {
                if (err) return res.status(500).json(err);

                // Fire GA event
                trackEvent(movie.title, movie.genre, 'POST /reviews', 'API Request for Movie Review');

                res.json({ message: 'Review created!' });
            });
        });
    });

app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only
