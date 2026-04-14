var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect(process.env.DB);

// Movie schema
var MovieSchema = new Schema({
    title: { type: String, required: true, index: { unique: true } },
    releaseDate: Number,
    genre: {
        type: String,
        enum: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Thriller', 'Western', 'Science Fiction']
    },
    actors: [
        {
            actorName: String,
            characterName: String
        }
    ],
    imageUrl: { type: String }
});

// return the model
module.exports = mongoose.model('Movie', MovieSchema);
