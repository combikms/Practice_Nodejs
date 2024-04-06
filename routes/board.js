const router = require('express').Router()

// function checkLogin(req, res, next) {
//     let result = req.user
//     if (result == undefined) {
//         res.render('login.ejs')
//     }
//     next()
// }

router.get('/sports', (req, res) => {
    res.send('스포츠 게시판')
})
router.get('/game', (req, res) => {
    res.send('게임 게시판')
})

module.exports = router