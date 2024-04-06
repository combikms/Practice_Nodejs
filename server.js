const express = require('express')
const app = express()
const methodOverride = require('method-override')
const { MongoClient, ObjectId } = require('mongodb')
const bcrypt = require('bcrypt')
require('dotenv').config()

const { createServer } = require('http')
const { Server } = require('socket.io')
const server = createServer(app)
const io = new Server(server)

app.use(methodOverride('_method'))
app.use(express.static(__dirname + '/public'))
app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const MongoStore = require('connect-mongo')

app.use(passport.initialize())
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60 * 60 * 1000 },
    store: MongoStore.create({
        mongoUrl: process.env.DB_URL,
        dbName: 'forum'
    })
}))

app.use(passport.session())

const { S3Client } = require('@aws-sdk/client-s3')
const multer = require('multer')
const multerS3 = require('multer-s3')
const s3 = new S3Client({
    region: 'ap-northeast-2',
    credentials: {
        accessKeyId: process.env.S3_KEY,
        secretAccessKey: process.env.S3_SECRET
    }
})

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: 'rankleanforum',
        key: function (req, file, cb) {
            cb(null, Date.now().toString()) //업로드시 파일명 변경가능
        }
    })
})

let db
let connectDB = require('./database.js')

connectDB.then((client) => {
    console.log('Connected to MongoDB')
    db = client.db('forum')
    server.listen(process.env.PORT, () => {
        console.log('Hosting from: http://localhost:8080')
    })
}).catch((err) => {
    console.log(err)
})

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
})

function printTime(req, res, next) {
    const currentDate = new Date();
    const currentTime = currentDate.toString();

    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDate();
    const currentHour = currentDate.getHours();
    const currentMinute = currentDate.getMinutes();
    const currentSecond = currentDate.getSeconds();

    const prettyTime = `${currentYear}/${currentMonth + 1}/${currentDay} ${currentHour}:${currentMinute}:${currentSecond}`
    console.log(prettyTime);
    next()
}

app.get('/list', printTime, async (req, res) => {
    let result = await db.collection('post').find().toArray()
    res.render('list.ejs', { posts: result, user: req.user })
})

app.get('/list/:id', async (req, res) => {
    let pageNum = (req.params.id - 1) * 5
    let result = await db.collection('post').find().skip(pageNum).limit(5).toArray()
    res.render('list.ejs', { posts: result })
})

app.get('/detail/:postId', async (req, res) => {
    try {
        let result = await db.collection('post').findOne({
            _id:
                new ObjectId(req.params.postId)
        })
        let comments = await db.collection('comment').find({
            parent_id:
                new ObjectId(req.params.postId)
        }).toArray()
        if (result == null) {
            res.send('그런 글 없다')
        } else {
            res.render('detail.ejs', { posts: result, comment: comments })
        }
    } catch (e) {
        console.log(e)
        res.status(404).send('이상한 URL 입력하지마라')
    }
})

app.get('/update/:postId', async (req, res) => {
    try {
        let result = await db.collection('post').findOne({
            _id: new ObjectId(req.params.postId),
            user: new ObjectId(req.user._id)
        })
        if (result == null) {
            res.send('니꺼만 수정해라')
        } else {
            res.render('update.ejs', { posts: result })
        }
    } catch (e) {
        console.log(e)
        res.status(404).send('이상한 URL 입력하지마라')
    }
})



app.post('/add', upload.single('img1'), async (req, res) => {
    try {
        if (req.body.title == '' || req.body.content == '') {
            res.send('빈칸 쓰지마')
        } else {
            console.log('<Posted>')
            console.log('title: ' + req.body.title)
            console.log('content: ' + req.body.content)
            await db.collection('post').insertOne({
                title: req.body.title,
                content: req.body.content,
                img: req.file ? req.file.location : '',
                user: req.user._id,
                username: req.user.username,
                comment: ''
            })
            res.redirect('/list')
        }
    } catch (e) {
        console.log(e)
        res.status(500).send('Server Error :(')
    }
})

app.put('/edit/:postId', async (req, res) => {

    try {
        if (req.body.title == '' || req.body.content == '') {
            res.send('빈칸 쓰지마')
        } else {
            console.log('<Updated>')
            console.log('title: ' + req.body.title)
            console.log('content: ' + req.body.content)
            await db.collection('post').updateOne({
                _id: new ObjectId(req.params.postId)
            }, {
                $set: {
                    title: req.body.title,
                    content: req.body.content
                }
            }
            )
            res.redirect('/list')
        }
    } catch (e) {
        console.log(e)
        res.status(500).send('Server Error :(')
    }
})

app.post('/delete/:postId', async (req, res) => {
    let result = await db.collection('post').deleteOne({
        _id: new ObjectId(req.params.postId),
        user: new ObjectId(req.user._id)
    })
    if (result.deletedCount == 1) {
        console.log('Successfully Deleted.')
    } else {
        console.log('Failed to delete.')
    }
})

// <MongoDB update 추가문법들>

// updateOne({ _id: 1 }, { $inc: { like: 1 } })  --> 좋아요 개수 +1하기
// updateOne({ _id: 1 }, { $mul: { like: 2 } })  --> 좋아요 개수 2배하기
// updateOne({ _id: 1 }, { $unset: { like: 1 } })  --> 좋아요 필드 삭제(거의 안씀)
// updateMany({ _id: 1 }, { $inc: { like: 1 } })  --> id가 1인 모든 걸 찾아서 수정

// updateMany({ like : {$gt : 10} }, { $inc: { like: 1 } })  --> 좋아요가 10보다 큰 거 다 찾아서 수정
// updateMany({ like : {$gte : 10} }, { $inc: { like: 1 } })  --> 좋아요가 10 이상인 거 다 찾아서 수정
// updateMany({ like : {$lt : 10} }, { $inc: { like: 1 } })  --> 좋아요가 10보다 작은 거 다 찾아서 수정
// updateMany({ like : {$lte : 10} }, { $inc: { like: 1 } })  --> 좋아요가 10 이하인 거 다 찾아서 수정
// updateMany({ like : {$ne : 10} }, { $inc: { like: 1 } })  --> 좋아요가 10이 아닌 거 다 찾아서 수정

passport.use(new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
    let result = await db.collection('user').findOne({ username: 입력한아이디 })
    if (!result) {
        return cb(null, false, { message: '아이디 DB에 없음' })
    }
    if (await bcrypt.compare(입력한비번, result.password)) {
        return cb(null, result)
    } else {
        return cb(null, false, { message: '비번불일치' });
    }
}))

passport.serializeUser((user, done) => {
    process.nextTick(() => {
        done(null, { id: user._id, username: user.username })
    })
})

passport.deserializeUser(async (user, done) => {
    let result = await db.collection('user').findOne({
        _id: new ObjectId(user.id)
    })
    delete result.password
    process.nextTick(() => {
        done(null, result)
    })
})

function checkLogin(req, res, next) {
    let result = req.user
    if (result == undefined) {
        res.render('login.ejs')
    }
    next()
}

app.get('/write', checkLogin, async (req, res) => {
    res.render('write.ejs', { time: new Date() })
})

app.get('/mypage', checkLogin, (req, res) => {
    let result = req.user
    res.render('mypage.ejs', { userinfo: result })
})

app.get('/register', (req, res) => {
    res.render('register.ejs')
})

app.post('/register', async (req, res) => {
    let result = await db.collection('user').findOne({
        username: req.body.username
    })
    if (result != null) {
        res.send('이미 있는 ID임')
    } else {
        if (req.body.password != req.body.passwordAgain) {
            res.send('비번이랑 비번확인이랑 일치 안함')
        } else {
            let hashedPw = await bcrypt.hash(req.body.password, 10)
            await db.collection('user').insertOne({
                username: req.body.username,
                password: hashedPw
            })
            res.redirect('/list')
        }
    }
})

app.get('/login', (req, res) => {
    res.render('login.ejs')
})

function loginError(req, res, next) {
    if (req.body.username == '') {
        res.send('아디 입력해라')
        return;
    } else {
        if (req.body.password == '') {
            res.send('비번 입력해라')
            return;
        }
    }
    next()
}

app.post('/login', loginError, async (req, res, next) => {
    passport.authenticate('local', (error, user, info) => {
        if (error) return res.status(500).json(error)
        if (!user) return res.status(401).json(info.message)
        req.logIn(user, (err) => {
            if (err) return next(err)
            res.redirect('/list')
        })
    })(req, res, next)
})

app.post('/search', async (req, res) => {
    const keyword = req.body.search

    let condition = [
        {
            $search: {
                index: 'title_index',
                text: { query: keyword, path: 'title' }
            }
        } //,
        // { $sort: { _id: 1 } } // id기준 오름차순
        // { $limit: 10 }, // 검색결과 10개만 보여줌 (skip도 가능)
        // { $project: { 제목: 1, _id: 0 } } // 0이면 필드 숨김, 1이면 필드 보임
    ]

    let result = await db.collection('post').aggregate(condition).toArray()
    res.render('list.ejs', { posts: result })
})

app.use('/shop', require('./routes/shop.js'))
app.use('/board/sub', require('./routes/board.js'))

app.post('/comment/:id', async (req, res) => {

    const currentDate = new Date();
    const currentTime = currentDate.toString();

    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDate();
    const currentHour = currentDate.getHours();
    const currentMinute = currentDate.getMinutes();
    const currentSecond = currentDate.getSeconds();

    const prettyTime = `${currentYear}/${currentMonth + 1}/${currentDay} ${currentHour}:${currentMinute}:${currentSecond}`

    try {
        if (req.body.content == '') {
            res.send('빈칸 쓰지마')
        } else {
            await db.collection('comment').insertOne({
                parent_id: new ObjectId(req.params.id),
                writer_id: req.user._id,
                writer: req.user.username,
                content: req.body.content,
                time: prettyTime
            })
            console.log('<Commented>')
            console.log(req.body.content)
            console.log(prettyTime);
            res.redirect('/detail/' + req.params.id)
        }
    } catch (e) {
        console.log(e)
        res.status(500).send('Server Error :(')
    }
})

app.get('/chat/:id', async (req, res) => {
    if (req.user == undefined) {
        res.render('login.ejs')
        return;
    }

    let post = await db.collection('post').findOne({
        _id: new ObjectId(req.params.id)
    })
    //console.log(post.title)

    const currentDate = new Date();

    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDate();
    const currentHour = currentDate.getHours();
    const currentMinute = currentDate.getMinutes();
    const currentSecond = currentDate.getSeconds();

    const prettyTime = `${currentYear}/${currentMonth + 1}/${currentDay} ${currentHour}:${currentMinute}:${currentSecond}`
    //console.log(prettyTime);

    let result = await db.collection('chatroom').findOne({
        postId: req.params.id,
        guest: req.user._id
    })

    if (result == null) {
        await db.collection('chatroom').insertOne({
            postId: req.params.id,
            title: post.title,
            guest: new ObjectId(req.user._id),
            lastMsg: '채팅이 시작되었습니다.',
            lastMsgTime: prettyTime
        })

        result = await db.collection('chatroom').findOne({
            postId: req.params.id
        })
    }

    res.render('chat.ejs', { chat: result })
})

app.get('/chatroom', checkLogin, async (req, res) => {
    if (req.user == undefined) {
        return;
    }
    let result = await db.collection('chatroom').find(
        { guest: req.user._id }
    ).toArray()
    res.render('chatroom.ejs', { chat: result })
})

io.on('connection', (socket) => {

    socket.on('ask-join', (data) => {
        console.log('채팅에 참가시켜줍니다.' + data)
        socket.join(data)
    })

    socket.on('message', (data) => {
        console.log('<수신됨 - ' + data.room + '>')
        console.log(data.msg)
        io.to(data.room).emit('broadcast', '어 그래 반갑다.')
    })

})

app.get('/stream/list', (req, res) => {

    res.writeHead(200, {
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
    });

    let cond = [
        { $match: { operationType: 'insert' } }
    ]

    let changeStream = db.collection('post').watch(cond)
    changeStream.on('change', (result) => {
        console.log(result.fullDocument)
        res.write('event: msg\n');
        res.write(`data: ${JSON.stringify(result.fullDocument)}\n\n`);
    })

});