// anki-update-sentences.js

// Import necessary modules using require() syntax
const fetch = require('node-fetch').default; // IMPORTANT: Access the .default export for fetch
const JishoAPI = require('unofficial-jisho-api');

// Create a new instance of the Jisho API
const jisho = new JishoAPI();

// AnkiConnect API endpoint
const ANKICONNECT_URL = 'http://localhost:8765';

// Configuration for your Anki deck and fields
const TARGET_DECK_NAME = 'Kodansha Kanji Learner\'s Course'; // <--- IMPORTANT: Verify this name!
const TARGET_NOTE_TYPE = 'KKLCVocabJapanese'; // <--- Specify your target note type here!
const KANJI_FIELD_NAME = 'Kanji'; // The field that contains the Kanji/Word
const EXAMPLE_SENTENCE_FIELD_NAME = 'ExampleSentence'; // The new field to store example sentences

// Batching and Delay Configuration
const BATCH_SIZE = 100; // Number of notes to process in each batch for notesInfo (reading)
const REQUEST_DELAY_MS = 250; // Delay in milliseconds between each AnkiConnect request (notesInfo, *individual* updateNoteFields, Jisho API)

// --- PROCESSING RANGE CONFIGURATION (for debugging) ---
// Set these to process only a subset of your notes.
// PROCESS_START_INDEX (0-based): The index of the first note to process *within the filtered note IDs*.
// PROCESS_END_INDEX (0-based): The index of the last note to process *within the filtered note IDs*.
// Set to -1 or a very large number to process until the end of the deck (e.g., set PROCESS_END_INDEX to -1 for all).
const PROCESS_START_INDEX = 0; // Start from the first relevant note
const PROCESS_END_INDEX = 99;  // Process up to the 100th relevant note (index 99)
// ------------------------------------------

/**
 * Sends a request to the AnkiConnect API.
 * @param {string} action The AnkiConnect action to perform.
 * @param {any} params Parameters for the AnkiConnect action. This object will be nested under "params" in the final payload.
 * @returns {Promise<any>} The result from AnkiConnect.
 */
async function invokeAnkiConnect(action, params = {}) {
    const payload = { action, version: 6, params };
    // DEBUGGING LINE: Only log specific payloads if needed to reduce clutter
    // console.log(`[DEBUG] Sending payload for action '${action}':`, JSON.stringify(payload, null, 2));
    try {
        const response = await fetch(ANKICONNECT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload), // Use the 'payload' variable
        });

        if (!response.ok) {
            throw new Error(`AnkiConnect HTTP error! Status: ${response.status}`);
        }

        const jsonResponse = await response.json();
        if (jsonResponse.error) {
            throw new Error(`AnkiConnect error: ${jsonResponse.error}`);
        }
        return jsonResponse.result;
    } catch (error) {
        console.error(`Error invoking AnkiConnect action '${action}':`, error);
        throw error; // Re-throw to propagate the error
    }
}

/**
 * Helper function to introduce a delay.
 * @param {number} ms Milliseconds to wait.
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms);
}

/**
 * Fetches example sentences for a given word using Jisho API.
 * This version uses separate Kanji, Kana, and English lines.
 * @param {string} word The Kanji/word to search for.
 * @returns {Promise<string>} Formatted HTML string of example sentences.
 */
async function getFormattedExampleSentences(word) {
    try {
        // Add a small delay before each Jisho API call to be polite and avoid rate limits
        await delay(REQUEST_DELAY_MS);
        const result = await jisho.searchForExamples(word);
        let sentencesHtml = '';
        const numExamples = Math.min(3, result.results.length); // Get up to 3 examples

        if (numExamples === 0) {
            return '<p>No example sentences found.</p>';
        }

        sentencesHtml += '<p><strong>Example Sentences:</strong></p>';
        for (let i = 0; i < numExamples; ++i) {
            let example = result.results[i];
            sentencesHtml += `<p style="margin-bottom: 5px;">`;
            sentencesHtml += `<strong style="color: #FFD700;">Kanji:</strong> ${example.kanji}<br>`;
            sentencesHtml += `<strong style="color: #ADD8E6;">Kana:</strong> ${example.kana}<br>`; // Reverted to separate Kana line
            sentencesHtml += `<strong style="color: #90EE90;">English:</strong> ${example.english}`;
            sentencesHtml += `</p>`;
            if (i < numExamples - 1) {
                sentencesHtml += `<hr style="border: none; border-top: 1px dashed #ccc; margin: 10px 0;">`;
            }
        }
        return sentencesHtml;
    } catch (error) {
        console.error(`Error fetching example sentences for "${word}":`, error);
        return `<p>Error fetching example sentences for "${word}".</p>`;
    }
}

/**
 * Main function to update Anki notes.
 */
async function updateAnkiDeckWithSentences() {
    console.log(`Starting to update deck: "${TARGET_DECK_NAME}" and note type: "${TARGET_NOTE_TYPE}"`);

    try {
        // 1. Find all notes of the TARGET_NOTE_TYPE in the target deck
        console.log(`Finding all note IDs for note type "${TARGET_NOTE_TYPE}" in deck "${TARGET_DECK_NAME}"...`);
        // Use the combined query for deck and note type
        const query = `deck:"${TARGET_DECK_NAME}" "note:${TARGET_NOTE_TYPE}"`;
        const allNoteIds = await invokeAnkiConnect('findNotes', { query: query });
        console.log(`Found ${allNoteIds.length} notes of type "${TARGET_NOTE_TYPE}".`);

        if (allNoteIds.length === 0) {
            console.log('No notes found for the specified deck and note type. Exiting.');
            return;
        }

        // Apply the processing range to the filtered note IDs
        const startIndex = Math.max(0, PROCESS_START_INDEX);
        const endIndex = (PROCESS_END_INDEX === -1 || PROCESS_END_INDEX >= allNoteIds.length) ? allNoteIds.length - 1 : PROCESS_END_INDEX;

        const noteIdsToProcess = allNoteIds.slice(startIndex, endIndex + 1); // +1 because slice end is exclusive
        console.log(`Processing notes from index ${startIndex} to ${endIndex} ` +
                    `(${noteIdsToProcess.length} notes within the filtered set).`);

        if (noteIdsToProcess.length === 0) {
            console.log('No notes to process in the specified range. Exiting.');
            return;
        }

        let updatedNotesCount = 0;

        // 2. Process notes in batches (for notesInfo)
        for (let i = 0; i < noteIdsToProcess.length; i += BATCH_SIZE) {
            const batchNoteIds = noteIdsToProcess.slice(i, i + BATCH_SIZE);
            const currentBatchOriginalStart = startIndex + i;
            const currentBatchOriginalEnd = Math.min(startIndex + i + BATCH_SIZE - 1, endIndex);

            console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(noteIdsToProcess.length / BATCH_SIZE)} ` +
                        `(Original indices ${currentBatchOriginalStart} to ${currentBatchOriginalEnd}, current batch size: ${batchNoteIds.length})...`);

            // Get information about this batch of notes
            await delay(REQUEST_DELAY_MS); // Delay before this potentially heavy call
            const notesInfo = await invokeAnkiConnect('notesInfo', { notes: batchNoteIds });
            
            // Process each note in the current batch individually for updates
            for (const note of notesInfo) {
                const kanji = note.fields[KANJI_FIELD_NAME]?.value;

                if (!kanji) {
                    console.warn(`Note ${note.noteId} is missing the "${KANJI_FIELD_NAME}" field. Skipping.`);
                    continue;
                }

                // Check if the ExampleSentence field is already populated
                const existingExampleSentence = note.fields[EXAMPLE_SENTENCE_FIELD_NAME]?.value;
                if (existingExampleSentence && existingExampleSentence.trim() !== '' && !existingExampleSentence.includes('Error fetching')) {
                    // If you want to force update even if populated, remove this 'continue'
                    // console.log(`Note ${note.noteId} for "${kanji}" already has an example sentence. Skipping.`); // Uncomment for verbose skipping
                    continue; // Skip if already populated and not an error message
                }

                console.log(`  Fetching example sentences for "${kanji}" (Note ID: ${note.noteId})...`);
                const exampleSentencesHtml = await getFormattedExampleSentences(kanji); // This function has its own delay

                // Update one note at a time here
                await delay(REQUEST_DELAY_MS); // Delay before each individual update
                await invokeAnkiConnect('updateNoteFields', {
                    note: {
                        id: note.noteId,
                        fields: {
                            [EXAMPLE_SENTENCE_FIELD_NAME]: exampleSentencesHtml,
                        },
                    },
                });
                updatedNotesCount++; // Increment count for each successful update
                console.log(`  Updated note ${note.noteId} for "${kanji}".`);
            }
        }

        console.log(`Process complete. Total notes updated: ${updatedNotesCount}.`);

    } catch (error) {
        console.error('An unhandled error occurred during the update process. Some notes might not have been updated:', error);
    } finally {
        console.log('Process finished.');
    }
}

// Execute the main function
updateAnkiDeckWithSentences();
