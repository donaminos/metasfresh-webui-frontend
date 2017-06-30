var testUrl = process.env.CHIMP_TEST_URL || 'http://localhost',

module.exports = function() {

    this.Given(/^I visited Metasfresh site$/, function () {
        browser.url(testUrl);
    });
};
