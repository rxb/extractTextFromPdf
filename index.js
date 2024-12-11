const { Storage } = require('@google-cloud/storage');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const storage = new Storage();
const visionClient = new ImageAnnotatorClient();

exports.extractTextFromPdf = async (req, res) => {
  try {
    const pdfUrl = req.query.url;
    if (!pdfUrl) {
      return res.status(400).send("Missing 'url' query parameter.");
    }

    // Create a unique filename for the PDF in GCS
    const filename = `temp-${uuidv4()}.pdf`;
    const file = storage.bucket(process.env.STORAGE_BUCKET).file(filename);

    // Stream the PDF from the external URL into GCS
    const response = await axios.get(pdfUrl, { responseType: 'stream' });
    await new Promise((resolve, reject) => {
      const writeStream = file.createWriteStream();
      response.data.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Prepare the request for the Vision API: asyncBatchAnnotateFiles
    const outputPrefix = `output/`;
    const request = {
      requests: [
        {
          inputConfig: {
            gcsSource: { uri: `gs://${process.env.STORAGE_BUCKET}/${filename}` },
            mimeType: 'application/pdf',
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          outputConfig: {
            gcsDestination: { uri: `gs://${process.env.STORAGE_BUCKET}/${outputPrefix}` },
            batchSize: 1,
          },
        },
      ],
    };

    // Start the async file annotation request
    const [operation] = await visionClient.asyncBatchAnnotateFiles(request);
    const [filesResponse] = await operation.promise();

    // Read the output JSON from GCS
    const [files] = await storage.bucket(process.env.STORAGE_BUCKET).getFiles({ prefix: outputPrefix });

    let fullText = '';
    for (const file of files) {
      const [contents] = await file.download();
      const response = JSON.parse(contents);

      // Extract the text annotations
      for (const pageResponse of response.responses) {
        if (pageResponse.fullTextAnnotation && pageResponse.fullTextAnnotation.text) {
          fullText += pageResponse.fullTextAnnotation.text + '\n';
        }
      }

      // Optionally, delete the output file
      await file.delete().catch(() => {});
    }

    // Clean up the temporary PDF file from GCS (optional)
    await storage.bucket(process.env.STORAGE_BUCKET).file(filename).delete().catch(() => {});

    // Return the extracted text
    return res.status(200).send(fullText);
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return res.status(500).send('Internal Server Error');
  }
};

