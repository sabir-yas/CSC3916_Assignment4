var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect(process.env.DB);

// Review schema
var ReviewSchema = new Schema({
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    username: { type: String, required: true },
    review: { type: String, required: true },
    rating: { type: Number, min: 0, max: 5, required: true }
}, { timestamps: true });

// return the model
module.exports = mongoose.model('Review', ReviewSchema);
