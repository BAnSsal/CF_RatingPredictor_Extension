

// Add a click event listener to the button with ID 'fetchStandings'\
let contest_user="";
let currentrank=0;
document.getElementById('fetchStandings').addEventListener('click', () => {
    // Query to get the active tab in the current window
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        // Get the URL of the current tab
        let url = tabs[0].url;
        console.log("Current tab URL:", url);
        
        // Extract contest ID from the URL
        let contestId = extractContestId(url);

        // Check if a valid contest ID was found
        if (contestId) {
            console.log("Extracted contest ID:", contestId);
            
            // Prompt the user to enter their Codeforces handle
            let userHandle = prompt("Enter your handle:");
            contest_user=userHandle
            // Proceed if a handle was provided
            if (userHandle) {
                console.log("User input handle:", userHandle);
                
                // Fetch standings for the specified contest and user handle
                fetchUserStandings(contestId, userHandle);
            } else {
                // Alert and log if no handle was provided
                alert("Handle not provided.");
                console.error("Handle not provided by user.");
            }
        } else {
            // Alert and log if the URL was not a valid contest page
            alert("Not a valid Codeforces contest page.");
            console.error("Invalid contest URL, could not extract contest ID.");
        }
    });
});

// Function to extract contest ID from a given URL
function extractContestId(url) {
    // Regular expression to match 'contest/{contestId}' in the URL
    let regex = /contest\/(\d+)/;
    // Use regex to find contest ID
    let match = url.match(regex);
    // Return the contest ID if found, else return null
    return match ? match[1] : null;
}

// Function to fetch standings of a particular contest for a user handle
function fetchUserStandings(contestId, userHandle) {
    console.log(`Fetching standings for contest ${contestId}`);
    // Fetch contest standings from Codeforces API
    fetch(`https://codeforces.com/api/contest.standings?contestId=${contestId}&showUnofficial=false`, {
        method: 'GET', // Specify the request method
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Referer": "https://codeforces.com"
        }
    }).then(response => response.json()) // Convert response to JSON
        .then(data => {
            // Check if the API response is successful
            if (data.status === "OK") {
                // Extract the rows of standings from the API response
                let standings = data.result.rows;
                console.log(`Received ${standings.length} standings entries`);
                
                // Find the specific user in the standings
                let userFound = standings.find(row => row.party.members[0].handle === userHandle);

                // If the user was found in the standings
                if (userFound) {
                    console.log(`User ${userHandle} found in standings:`, userFound);
                    // Show an alert with user's rank and points
                    currentrank=userFound.rank
                    alert(`Your rank: ${userFound.rank}\nPoints: ${userFound.points}`);
                } else {
                    // Log and alert if the user was not found
                    console.log(`User ${userHandle} not found in standings`);
                    alert("Handle not found in the standings.");
                }

                // Process the standings to extract relevant data
                let allStandings = standings.map(row => ({
                    rank: row.rank,
                    handle: row.party.members[0].handle,
                    points: row.points
                }));

                console.log("Processed standings:", allStandings);
                // Fetch old ratings for the users in the standings
                fetchOldRatings(allStandings, contestId);
            } else {
                // Log if there was an error in the API response
                console.error('Error in API response:', data.comment);
            }
        })
        .catch(error => {
            // Log any errors that occur during the fetch
            console.error('Error fetching standings:', error);
        });
}

// Function to fetch old ratings of participants from Codeforces
// Function to fetch old ratings of participants from Codeforces with delay between each batch
function fetchOldRatings(allStandings, contestId) {
    console.log("Fetching old ratings for all participants");
    const batchSize = 500; // Set batch size to avoid API request limits
    const batches = []; // Array to store batches

    // Split participants into batches of 100
    for (let i = 0; i < allStandings.length; i += batchSize) {
        batches.push(allStandings.slice(i, i + batchSize));
    }

    console.log(`Split participants into ${batches.length} batches`);

    // Function to fetch a single batch with a delay between each call
    function fetchBatchWithDelay(batch, delay) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Get the handles of participants in the batch
                const handles = batch.map(participant => participant.handle).join(';');
                //console.log(`Fetching user info for batch of ${batch.length} handles`);
                
                // Fetch user information from Codeforces API
                fetch(`https://codeforces.com/api/user.info?handles=${handles}`)
                    .then(response => response.json()) // Convert response to JSON
                    .then(data => {
                        // Check if the response is successful
                        if (data.status === "OK") {
                            console.log(`Received user info for ${data.result.length} users`);
                            resolve(data.result); // Resolve with fetched user data
                        } else {
                            console.error('Error in API response:', data.comment);
                            resolve([]); // Resolve with empty array on error
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching user info:', error);
                        resolve([]); // Resolve with empty array on fetch error
                    });
            }, delay); // Delay the fetch by the specified time
        });
    }

    // Function to sequentially process batches with a delay
    async function processBatchesWithDelay(batches, delay) {
        const results = [];

        for (let i = 0; i < batches.length; i++) {
            const result = await fetchBatchWithDelay(batches[i], i * delay); // Apply incremental delay
            results.push(...result); // Add the result to the overall results
        }

        return results;
    }

    // Use the function to fetch batches with a delay of 5 seconds between each
    processBatchesWithDelay(batches, 0.5) //
        .then(results => {
            const userInfoMap = new Map();
            // Combine all batches and map handles to old ratings
            results.forEach(user => {
                userInfoMap.set(user.handle, user.rating || 1500); // Default to 1500 if no rating
            });

            console.log(`Collected old ratings for ${userInfoMap.size} users`);

            // Add old ratings to the processed standings
            const processedStandings = allStandings.map(participant => ({
                ...participant,
                oldRating: userInfoMap.get(participant.handle) || 1500
            }));

            console.log("Processed standings with old ratings:", processedStandings);
            //newsex
           // let proData=preprocessfinal(processedStandings);

            // Preprocess data for prediction
            let processedData = preprocessfinal(processedStandings);
            console.log("Final processed data:", processedData);
            // Send processed data to prediction server
            sendRankData(processedData);
        })
        .catch(error => {
            console.error('Error processing old ratings:', error);
        });
}
function preprocessfinal(data) {
    // Sort data according to old rating

    let user_final = null;
    let ind=0;
    let avg10=0
    let avg20=0
    let avg40 =0
    let avg80 =0
    let avg140 =0
    let avg250 =0
    let avg400 =0
    data.forEach((participant, index) => {
        if (participant.handle === contest_user) {
            ind=index;
                avg10= computeAverage(data, index, 10),
                avg20= computeAverage(data, index, 20),
                avg40= computeAverage(data, index, 40),
                avg80= computeAverage(data, index, 80),
                avg140= computeAverage(data, index, 140),
                avg250= computeAverage(data, index, 250),
                avg400= computeAverage(data, index, 400)}
    });
    
    data.sort((a, b) => b.oldRating - a.oldRating);
    data.forEach((participant, index) => {
        if (participant.handle == contest_user) {
            user_final = {
                avg_10: avg10,
                avg_20: avg20,
                avg_40: avg40,
                avg_80: avg80,
                avg_140: avg140,
                avg_250: avg250,
                avg_400: avg400,
                diff_rank: currentrank - index - 1,
                old_rank: index + 1,
                rank: currentrank,
                handle: participant.handle,
                old_rating: participant.oldRating
            };
            console.log("SACcyy");
            console.log(user_final);
        }
    });

    return user_final;
}

/*
// Function to preprocess contest data before sending to prediction server
function preprocessData(data) {
    console.log("Preprocessing data");
    // Remove participants with extreme ranks
    

    // Add computed average ratings and rank differences to the data
    data.forEach((participant, index) => {
        data[index] = {
            ...participant,
            avg_10: computeAverage(cleanedData, index, 10),
            avg_20: computeAverage(cleanedData, index, 20),
            avg_40: computeAverage(cleanedData, index, 40),
            avg_80: computeAverage(cleanedData, index, 80),
            avg_140: computeAverage(cleanedData, index, 140),
            avg_250: computeAverage(cleanedData, index, 250),
            avg_400: computeAverage(cleanedData, index, 400),
            diff_rank: index > 0 ? participant.rank - cleanedData[index - 1].rank : 0
        };
    });

    let trimmedData = removeExtremeRanks(data);
    console.log(`Data after removing extreme ranks: ${trimmedData.length} entries`);
    
    // Remove low-rated participants
    let cleanedData = removeLowRatedParticipants(trimmedData);
    console.log(`Data after removing low rated participants: ${cleanedData.length} entries`);

    console.log("Finished preprocessing data");
    return cleanedData; // Return the processed data
}*/

// Function to compute average old ratings over a specified group size
function computeAverage(data, index, group) {
    // Define start and end indices for computing average
    let start = Math.max(0, index - group / 2);
    let end = Math.min(data.length, index + group / 2);
    
    // Sum up old ratings and calculate average
    let total = data.slice(start, end).reduce((sum, item) => sum + item.oldRating, 0);
    return total / (end - start);
}

// Function to remove participants with extreme ranks (e.g., top 500 and bottom 500)
function removeExtremeRanks(data) {
    // Sort participants by rank
    data.sort((a, b) => a.rank - b.rank);
    // Return data excluding top 500 and bottom 500 participants
    return data.slice(500, data.length - 500);
}

// Function to remove participants with low ratings and no points scored
function removeLowRatedParticipants(data, ratingThreshold = 800) {
    // Filter out participants with low ratings and zero points
    return data.filter(item => item.oldRating >= ratingThreshold && item.points >= 0);
}

// Function to send processed contest data to a prediction server
function sendRankData(processedData) {
    console.log("Sending rank data to prediction server");
    // Prepare the data for the request
    const data2 = {
        rank: processedData.rank,               // rank
        old_rating: processedData.old_rating,    // oldRating//corrected
        avg_10: processedData.avg_10,           // avg_10
        avg_20: processedData.avg_20,           // avg_20
        avg_40: processedData.avg_40,           // avg_40
        avg_80: processedData.avg_80,           // avg_80
        avg_140: processedData.avg_140,         // avg_140
        avg_250: processedData.avg_250,         // avg_250
        avg_400: processedData.avg_400,         // avg_400
        oldRating_rank: processedData.old_rank, // oldRating_rank//corrected
        diff_rank: processedData.diff_rank      // diff_rank
    };
    console.log("data:", data2);

    fetch('http://localhost:5000/predict', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data2) // Send the prepared data directly
    })
    .then(response => response.json())
    .then(data => {
        console.log("Received prediction response:", data);
        if (data.error) {
            console.error("Prediction error:", data.error);
            alert(`Error: ${data.error}`);
        } else if (data.predicted_rating_change !== undefined) {
            console.log("Predicted rating change:", data.predicted_rating_change);
            alert(`Predicted rating change: ${Math.round(data.predicted_rating_change)}`);
        } else {
            console.error("Unexpected response format:", data);
            alert("Unexpected response from prediction server.");
        }
    })
    .catch(error => {
        console.error('Error sending rank data:', error);
        alert("Error occurred while predicting rating change.");
    });
}
