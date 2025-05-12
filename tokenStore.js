const fs = require('fs');
const file = './tokens.json';

function read() {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch {
        return {};
    }
}

function write(data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

exports.get = (userId) => read()[userId] || null;

exports.set = (userId, tokenData) => {
    const data = read();
    data[userId] = tokenData;
    write(data);
};

exports.all = () => read();
