import gdown
import pickle
from flask import Flask, request, jsonify
import numpy as np
from flask_cors import CORS

# Direct download link from Google Drive
file_id = "1nNJsfwCgKXgcZU0s1XgkzN6uNf0SWIhh"
download_url = f"https://drive.google.com/uc?id={file_id}"

# Use gdown to download the file
gdown.download(download_url, "model.pkl", quiet=False)

# Load the model from the downloaded pickle file
with open("model.pkl", "rb") as f:
    model = pickle.load(f)

app = Flask(__name__)
CORS(app)

# Load other files as before
with open('scaler.pkl', 'rb') as f:
    scaler = pickle.load(f)

with open('model.pkl', 'rb') as f:
    best_rf_model = pickle.load(f)

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Get participant data from request
        participant = request.json

        if not participant:
            return jsonify({'error': 'No participant data provided'})

        print("Received participant data")

        # Extract features based on the correct inputs
        try:
            features = [
                participant.get('rank', 0),               # rank
                participant.get('old_rating', 0),         # oldRating
                participant.get('avg_10', 0),             # avg_10
                participant.get('avg_20', 0),             # avg_20
                participant.get('avg_40', 0),             # avg_40
                participant.get('avg_80', 0),             # avg_80
                participant.get('avg_140', 0),            # avg_140
                participant.get('avg_250', 0),            # avg_250
                participant.get('avg_400', 0),            # avg_400
                participant.get('oldRating_rank', 0),     # oldRating_rank
                participant.get('diff_rank', 0)           # diff_rank
            ]
        except Exception as e:
            print(f"Error processing participant data: {e}")
            return jsonify({'error': f'Error processing data: {str(e)}'})

        # Convert to numpy array and scale
        input_features = np.array([features])
        print(input_features)
        input_scaled = scaler.transform(input_features)

        # Predict rating change
        prediction = best_rf_model.predict(input_scaled)
        predicted_rating_change = prediction[0] if len(prediction) > 0 else None

        print(f"Predicted rating change: {predicted_rating_change}")

        return jsonify({'predicted_rating_change': predicted_rating_change})
    except Exception as e:
        print(f"Error in prediction: {str(e)}")
        return jsonify({'error': str(e)})

if __name__ == '__main__':
    app.run(debug=True)
