var seleniumHost = process.env.CHIMP_SELENIUM_HOST || 'localhost',
    seleniumPort = process.env.CHIMP_SELENIUM_PORT || 4444;

module.exports = {

    // - - - - CUCUMBER - - - -
    path: './features',
    format: 'pretty',
    tags: '~@ignore',
    singleSnippetPerFile: true,
    recommendedFilenameSeparator: '_',
    screenshotsOnError: true,
    screenshotsPath: './report/screenshots',
    captureAllStepScreenshots: false,
    saveScreenshotsToDisk: true,
    saveScreenshotsToReport: true,
    jsonOutput: './report/cucumber.json',
    conditionOutput: true,

    // - - - - CUCUMBER REPORT - - - -
    htmlReport: true,
    theme: 'bootstrap',
    jsonFile: './report/cucumber.json',
    output: './report/cucumber.html',
    reportSuiteAsScenarios: true,
    launchReport: true,

    // - - - - SELENIUM  - - - -
    browser: 'chrome',
    platform: 'ANY',
    name: '',
    user: '',
    key: '',
    port: seleniumPort,
    host: seleniumHost,

    // - - - - WEBDRIVER-IO  - - - -
    webdriverio: {
        desiredCapabilities: {},
        logLevel: 'silent',
        logOutput: './report/logs',
        host: seleniumHost,
        port: seleniumPort,
        path: '/wd/hub',
        baseUrl: 'http://localhost',
        coloredLogs: true,
        screenshotPath: './report/screenshots',
        waitforTimeout: 500,
        waitforInterval: 250,
    },

    // - - - - DEBUGGING  - - - -
    log: 'info',
    debug: false,
    seleniumDebug: null,
    debugCucumber: null,
    debugBrkCucumber: null,
    debugMocha: null,
    debugBrkMocha: null
};