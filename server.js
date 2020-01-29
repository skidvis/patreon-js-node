const express = require('express');
var url = require('url');
var patreon = require('patreon');
var patreonOAuth = patreon.oauth;

// Use the client id and secret you received when setting up your OAuth account
const PORT = process.env.PORT || 5000;
var HOST = process.env.HOST;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;
const PROD_URL = process.env.PROD_URL;
var clientId = process.env.CLIENT_ID;
var clientSecret = process.env.CLIENT_SECRET;

const app = express()
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.set('views', __dirname + '/views');
app.use('/public', express.static('public'));

if (PORT == 5000) {
    //if you use heroku local, set the redirect to localhost
    fullUrl = `http://${HOST}:${PORT}`;
} else {
    //else use the heroku url
    HOST = null;
    fullUrl = PROD_URL;
}
var redirect = `${fullUrl}/oauth/redirect`;

const oauthClient = patreonOAuth(clientId, clientSecret);

// mimic a database
let database = {}

const loginUrl = url.format({
    protocol: 'https',
    host: 'patreon.com',
    pathname: '/oauth2/authorize',
    query: {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirect,
        state: 'chill'
    }
})

//root url
app.get('/', (req, res) => {
    return res.render('index', { redirect: redirect, loginUrl: loginUrl });
})

//patreon oauth url
app.get('/oauth/redirect', (req, res) => {
    const { code } = req.query
    let token

    return oauthClient.getTokens(code, redirect)
        .then(({ access_token }) => {
            token = access_token // eslint-disable-line camelcase
            const apiClient = patreon.patreon(token)
            return apiClient('/current_user')
        })
        .then(({ store, rawJson }) => {
            const { id } = rawJson.data
            database[id] = { ...rawJson.data, token }
            console.log(`Saved user ${store.find('user', id).full_name} to the database`)
            return res.redirect(`/members/${id}`)
        })
        .catch((err) => {
            console.log(err)
            console.log('Redirecting to login')
            res.redirect('/')
        })
})

//lists patrons 
app.get('/members/:id', (req, res) => {
    const { id } = req.params

    // load the user from the database
    const user = database[id]
    if (!user || !user.token) {
        return res.redirect('/')
    }

    const apiClient = patreon.patreon(user.token)

    // make api requests concurrently
    return apiClient(`/campaigns/${CAMPAIGN_ID}/pledges?include=patron.null`)
        .then(({ store }) => {
            var users = store.findAll('user');
            var pledges = store.findAll('pledge');
            return res.render('memberlist', { members: users, pledges: pledges });
        }).catch((err) => {
            const { status, statusText } = err
            console.log('Failed to retrieve campaign info')
            console.log(err)
            return res.json({ status, statusText })
        })
})

//start server
const server = app.listen({ host: HOST, port: PORT }, () => {
    console.log(`Listening on ${HOST}:${PORT}`);
});
