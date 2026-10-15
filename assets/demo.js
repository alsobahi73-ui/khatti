/* بيئة تهيئة البيانات الأولية للحسابات التجريبية والعينات التشغيلية. */
function seedDemo(){
  (function(){if(K.get("seeded"))return;
  K.set("trips",[{id:"t1",lineId:"l1",when:"07:00 – صباحاً",status:"done",rated:false}]);
  K.set("bookings",[]);
  K.set("reports",[]);
  K.set("requests",[]);
  K.set("pxRatings",{});
  K.set("broadcasts",[{
    id:"b_seed_1",
    t:"تنبيه زحام مروري عام - تم تعديل المسار مؤقتاً.",
    msg:"تنبيه زحام مروري عام - تم تعديل المسار مؤقتاً.",
    d:"12/10/2026",
    time:"12/10/2026"
  }]);
  K.set("chat_l1",[
    {me:0,t:"صباح الخير، الكوستار القادمة متجهة للمحطة المركزية؟",time:"06:52"},
    {me:1,t:"صباح النور، نعم متواجدين بالقرب من الجسر الخشب.",time:"06:53"}
  ]);
  K.set("myComments",{});
  K.set("seeded",1);
  })();
}
