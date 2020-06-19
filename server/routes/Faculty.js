const router = require("express").Router();
const handle = require("../handlers");

const auth = require("../middlewares/auth");

// router
// .get("/profile",auth,handle.showFacultyProfile);

router.route("/profile").get(auth, handle.showFacultyProfile);

router.route("/update/:id")
.put(auth,handle.updateFProfile);


module.exports = router;